/**
 * READ-ONLY census of a database, to be run against the Coolify production database BEFORE any deploy.
 *
 *   node scripts/check-production-counts.cjs
 *
 * It reads DATABASE_URL from the environment, which Coolify already injects into the app container, so nothing
 * needs to be typed or pasted. Locally: DATABASE_URL="<url>" node scripts/check-production-counts.cjs
 *
 * It only runs SELECTs, inside one READ ONLY transaction, so Postgres itself refuses a write. It prints the
 * target (host, port, database name — never the password) so the output proves which database was measured,
 * then the numbers the homepage Books figure is built from. Nothing is written and nothing is reconciled: if a
 * number differs from the one on the site, that is a finding to understand, not something to fix by editing a count.
 *
 * The production image only contains scripts/ from its last build; if this file is not in it, use
 * scripts/check-production-counts.sql (same checks, pasted into psql) instead of deploying just to get it.
 */
const { PrismaClient } = require('@prisma/client');

const MODELS = ["Publisher", "PublisherLocation", "PublisherContact", "PublisherAgreement", "AgreementTemplate", "PublisherMessage", "ReadEvent", "PublisherUpload", "Journal", "Article", "Book", "Chapter", "User", "InstitutionMemberAccess", "UserSession", "Payment", "Feedback", "Subscription", "SubscriptionRequest", "Quotation", "Receipt", "ContentModule", "Submission", "Content", "AccessRequest", "UsageLog", "Institution", "SeatPurchase", "StudentActivity", "Bundle", "ValidationReport", "AgencyInquiry", "ContactInquiry", "Lead", "LeadInteraction", "Coupon", "CouponUsage", "DemoRequest", "ExtractionJob", "ExtractionItem", "Favorite", "EmailVerification", "PageVisit", "BlogPost", "EmailEngine", "EmailRule", "EmailSend", "EmailLog", "MediaAsset", "TakedownRequest", "Author", "ArticleAuthor", "IngestionState", "LibraryEvent", "IngestionRun", "IngestionAudit", "IngestionPreview", "IngestionSourceHealth", "DepartmentSweep", "FreeSession", "Campaign", "AIConversation", "AIMessage", "BookHarvestCheckpoint"];
const BOOK_COLUMNS = ["id", "title", "authors", "publisherId", "publisherName", "isbn", "doi", "year", "subject", "domain", "language", "country", "description", "coverUrl", "pdfUrl", "accessType", "status", "source", "fingerprint", "createdBy", "createdAt", "updatedAt", "rejectionNote", "edition", "metadata", "pages", "ownershipSource", "uploadId", "views", "accessStatus", "chapterCount", "lastIngestedAt", "licence", "licenceIsNC", "originalDate", "originalUrl", "rightsBasis", "rightsHolder", "rightsStatus", "rightsVerifiedAt", "rightsVerifiedBy", "sourceRecordId"];

(async () => {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set in this environment'); process.exit(2); }
  const u = new URL(process.env.DATABASE_URL);
  const p = new PrismaClient();
  await p.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const rows = (sql) => tx.$queryRawUnsafe(sql);
    const one = async (sql) => (await rows(sql))[0];
    const db = await one('select current_database() as db, inet_server_addr()::text as server, version() as v');
    console.log(JSON.stringify({ target: { host: u.hostname, port: u.port, database: db.db, server: db.server }, postgres: String(db.v).split(',')[0] }));

    const q = async (label, sql) => console.log(label.padEnd(44), JSON.stringify(await one(sql)));
    await q('Book published', `select count(*)::int n from "Book" where status = 'Published'`);
    await q('Book draft', `select count(*)::int n from "Book" where status = 'Draft'`);
    await q('Book draft, ingested (review queue)', `select count(*)::int n from "Book" where status = 'Draft' and "ownershipSource" = 'Ingested'`);
    await q('Book rejected', `select count(*)::int n from "Book" where status = 'Rejected'`);
    await q('Book total', `select count(*)::int n from "Book"`);
    await q('Content (legacy) Books, not draft', `select count(*)::int n from "Content" where "contentType" = 'Books' and status <> 'Draft'`);
    await q('Content (legacy) Books, any status', `select count(*)::int n from "Content" where "contentType" = 'Books'`);
    await q('HOMEPAGE Books = published Book + legacy', `select ((select count(*) from "Book" where status = 'Published') + (select count(*) from "Content" where "contentType" = 'Books' and status <> 'Draft'))::int as homepage_books`);
    await q('Book with no department (null or blank)', `select count(*)::int n from "Book" where domain is null or btrim(domain) = ''`);
    await q('DOI values used by more than one Book', `select count(*)::int values_duplicated, coalesce(sum(n - 1), 0)::int extra_rows from (select count(*) n from "Book" where doi is not null and btrim(doi) <> '' group by lower(regexp_replace(btrim(doi), '^https?://(dx\\.)?doi\\.org/', '', 'i')) having count(*) > 1) x`);
    await q('ISBN values used by more than one Book', `select count(*)::int values_duplicated, coalesce(sum(n - 1), 0)::int extra_rows from (select count(*) n from "Book" where isbn is not null and regexp_replace(upper(isbn), '[^0-9X]', '', 'g') <> '' group by regexp_replace(upper(isbn), '[^0-9X]', '', 'g') having count(*) > 1) x`);
    console.log('\nBook by source / status:');
    console.table(await rows(`select coalesce(source,'(none)') source, status, count(*)::int n from "Book" group by 1,2 order by 3 desc`));
    console.log('Book published by department (lowest first):');
    console.table(await rows(`select coalesce(nullif(btrim(domain), ''), '(no department)') department, count(*)::int n from "Book" where status = 'Published' group by 1 order by 2 asc`));

    console.log('Schema state (the expected change is ONE new table, "BookHarvestCheckpoint"):');
    const cp = await one(`select to_regclass('"BookHarvestCheckpoint"')::text as t`);
    console.log('  BookHarvestCheckpoint present:'.padEnd(44), cp.t ? 'yes' : 'no (the deploy will create it)');
    if (cp.t) console.table(await rows(`select provider, "lastSuccessfulSyncAt", ("cursor" is not null) as in_progress from "BookHarvestCheckpoint"`));
    const present = new Set((await rows(`select table_name from information_schema.tables where table_schema = 'public'`)).map((r) => r.table_name));
    console.log('  tables the app expects that are missing:'.padEnd(44), JSON.stringify(MODELS.filter((m) => !present.has(m))), '(only BookHarvestCheckpoint is expected)');
    const have = new Set((await rows(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'Book'`)).map((r) => r.column_name));
    console.log('  Book columns the app expects that are missing:'.padEnd(50), JSON.stringify(BOOK_COLUMNS.filter((c) => !have.has(c))), '(none expected)');
  });
  await p.$disconnect();
})().catch((e) => { console.error(String(e.message || e).split('\n')[0]); process.exit(1); });
