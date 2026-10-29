/**
 * Books count reconciliation. READ ONLY: one REPEATABLE READ, READ ONLY transaction, so every figure is from the same snapshot and
 * nothing can be written. Plain Node + @prisma/client, so it can run where the app runs:
 *
 *   node scripts/books-reconcile.cjs                       (local, DATABASE_URL from the environment)
 *   ssh … 'docker exec -i -w /app <app> node -' < scripts/books-reconcile.cjs      (production, nothing is written to the container)
 *
 * Books live in two tables (see src/lib/publicBooks.ts): `Book` (the "New" collection) and `Content` rows with contentType 'Books'
 * (the "Archived" collection). Every row is placed in exactly ONE bucket below, by the first rule that applies, so the buckets add
 * up to the table's row count and the public buckets add up to the public figure. Ids are UUIDs; the two tables are checked for
 * sharing none, so "unique book ids" is the sum of the two row counts.
 */
const { PrismaClient } = require('@prisma/client');

const norm = `regexp_replace(lower(btrim(title)), '[^a-z0-9]+', ' ', 'g')`;

(async () => {
  const p = new PrismaClient();
  const out = await p.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const one = async (sql) => JSON.parse(JSON.stringify((await tx.$queryRawUnsafe(sql))[0], (k, v) => (typeof v === 'bigint' ? Number(v) : v)));
    const many = async (sql) => JSON.parse(JSON.stringify(await tx.$queryRawUnsafe(sql), (k, v) => (typeof v === 'bigint' ? Number(v) : v)));
    const snapshot = await one(`select now() as at, current_database() as db`);

    // ── New collection (Book) ─────────────────────────────────────────────────────────────────────────────────────────────
    const book = await many(`
      select case
               when status = 'Published' and "accessStatus" = 'ViewableHere' and "pdfUrl" is not null then '1 public · full text served here'
               when status = 'Published'                                                              then '2 public · catalogue record only (links to the source)'
               when status = 'Draft' and (domain is null or btrim(domain) = '')                       then '3 held · Draft, no department (review queue)'
               when status = 'Draft'                                                                  then '4 held · Draft, department assigned'
               when status = 'Rejected'                                                               then '5 excluded · Rejected'
               else '6 held · other status'
             end as bucket, count(*)::int as n
        from "Book" group by 1 order by 1`);
    // ── Archived collection (Content, contentType Books) ──────────────────────────────────────────────────────────────────
    const legacy = await many(`
      select case
               when status <> 'Draft' and "validationStatus" = 'VALID_VIEWABLE' and "fileUrl" is not null then '1 public · full text served here'
               when status <> 'Draft'                                                                      then '2 public · listed, file not validated'
               when "validationStatus" = 'FLAGGED_CONTENT'                                                 then '3 held · Draft, file check failed'
               when "validationStatus" = 'VALID_VIEWABLE'                                                  then '4 held · Draft though the file validated (hidden by an admin)'
               else '5 held · Draft, not validated'
             end as bucket, count(*)::int as n
        from "Content" where "contentType" = 'Books' group by 1 order by 1`);

    const totals = await one(`select
        (select count(*)::int from "Book") as book_rows,
        (select count(distinct id)::int from "Book") as book_ids,
        (select count(*)::int from "Book" where status = 'Published') as book_public,
        (select count(*)::int from "Content" where "contentType" = 'Books') as legacy_rows,
        (select count(distinct id)::int from "Content" where "contentType" = 'Books') as legacy_ids,
        (select count(*)::int from "Content" where "contentType" = 'Books' and status <> 'Draft') as legacy_public,
        (select count(*)::int from "Book" b join "Content" c on c.id = b.id where c."contentType" = 'Books') as shared_ids`);

    // The same work held in both collections is two public records today (they are different rows). Reported, never merged here.
    const overlap = await one(`
      with a as (select ${norm} as t from "Book" where status = 'Published'),
           b as (select ${norm} as t from "Content" where "contentType" = 'Books' and status <> 'Draft')
      select (select count(*)::int from a) as structured_public,
             (select count(*)::int from b) as legacy_public,
             (select count(*)::int from a where t in (select t from b)) as structured_titles_also_in_legacy,
             (select count(distinct t)::int from a) + (select count(distinct t)::int from b)
               - (select count(distinct t)::int from a where t in (select t from b)) as distinct_titles_listed`);

    const byDept = await many(`
      select coalesce(nullif(btrim(domain), ''), '(none)') as department,
             count(*) filter (where src = 'new')::int as new_total,
             count(*) filter (where src = 'new' and status = 'Published')::int as new_public,
             count(*) filter (where src = 'archived')::int as archived_total,
             count(*) filter (where src = 'archived' and status <> 'Draft')::int as archived_public
        from (select domain, status, 'new' as src from "Book"
              union all select domain, status, 'archived' from "Content" where "contentType" = 'Books') t
       group by 1 order by 2 desc`);

    return { snapshot, totals, book, legacy, overlap, byDept };
  }, { timeout: 120000, maxWait: 20000 });
  await p.$disconnect();

  const sum = (rows, f = () => true) => rows.filter(f).reduce((s, r) => s + r.n, 0);
  const t = out.totals;
  const result = {
    ...out,
    checks: {
      'New buckets add up to Book rows': sum(out.book) === t.book_rows,
      'Archived buckets add up to legacy Book rows': sum(out.legacy) === t.legacy_rows,
      'New public buckets = Published': sum(out.book, r => r.bucket.includes('public')) === t.book_public,
      'Archived public buckets = non-Draft': sum(out.legacy, r => r.bucket.includes('public')) === t.legacy_public,
      'no id appears in both tables': t.shared_ids === 0,
      'ids are unique within each table': t.book_ids === t.book_rows && t.legacy_ids === t.legacy_rows,
    },
    admin: { New: t.book_rows, Archived: t.legacy_rows },
    publicFigure: t.book_public + t.legacy_public,
    uniqueBookIds: t.book_rows + t.legacy_rows,
  };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
})().catch((e) => { console.error('RECONCILE FAILED', String((e && e.message) || e).slice(0, 400)); process.exit(1); });
