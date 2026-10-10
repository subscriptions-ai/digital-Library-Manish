-- READ-ONLY census of the production database, to run BEFORE any deploy.
-- SELECT statements only, inside a READ ONLY transaction: Postgres itself refuses any write.
-- Nothing here reads or prints a password or a connection string.
--
-- Run it in the Postgres container's terminal in Coolify (the database is `postgres`):
--     psql -U postgres -d postgres -f check-production-counts.sql
-- or open `psql -U postgres -d postgres` and paste everything below.

BEGIN READ ONLY;

-- 1. Which database this is
SELECT current_database() AS database, current_setting('server_version') AS postgres_version, inet_server_addr()::text AS server;

-- 2. Book and Content counts
SELECT
  (SELECT count(*) FROM "Book" WHERE status = 'Published')                                        AS book_published,
  (SELECT count(*) FROM "Book" WHERE status = 'Draft')                                            AS book_draft,
  (SELECT count(*) FROM "Book" WHERE status = 'Draft' AND "ownershipSource" = 'Ingested')         AS book_draft_ingested,
  (SELECT count(*) FROM "Book" WHERE status NOT IN ('Published','Draft'))                         AS book_other_status,
  (SELECT count(*) FROM "Book")                                                                   AS book_total,
  (SELECT count(*) FROM "Content" WHERE "contentType" = 'Books' AND status <> 'Draft')            AS legacy_content_books_not_draft,
  (SELECT count(*) FROM "Content" WHERE "contentType" = 'Books')                                  AS legacy_content_books_any_status,
  (SELECT count(*) FROM "Book" WHERE status = 'Published')
    + (SELECT count(*) FROM "Content" WHERE "contentType" = 'Books' AND status <> 'Draft')        AS homepage_books_total;

-- 3. Books grouped by source and status
SELECT coalesce(source, '(none)') AS source, status, count(*) AS n FROM "Book" GROUP BY 1, 2 ORDER BY 3 DESC;

-- 4. Published Books by department (fewest first)
SELECT coalesce(nullif(btrim(domain), ''), '(no department)') AS department, count(*) AS n
FROM "Book" WHERE status = 'Published' GROUP BY 1 ORDER BY 2 ASC;

-- 5. Books with no department (null or blank), by status
SELECT status, count(*) AS n FROM "Book" WHERE domain IS NULL OR btrim(domain) = '' GROUP BY 1 ORDER BY 1;

-- 6. Duplicate identifiers among Books (counts only; nothing is merged or changed)
SELECT count(*) AS doi_values_used_more_than_once, coalesce(sum(n - 1), 0) AS extra_rows FROM (
  SELECT lower(regexp_replace(btrim(doi), '^https?://(dx\.)?doi\.org/', '', 'i')) AS d, count(*) AS n
  FROM "Book" WHERE doi IS NOT NULL AND btrim(doi) <> '' GROUP BY 1 HAVING count(*) > 1) x;
SELECT count(*) AS isbn_values_used_more_than_once, coalesce(sum(n - 1), 0) AS extra_rows FROM (
  SELECT regexp_replace(upper(isbn), '[^0-9X]', '', 'g') AS i, count(*) AS n
  FROM "Book" WHERE isbn IS NOT NULL AND regexp_replace(upper(isbn), '[^0-9X]', '', 'g') <> '' GROUP BY 1 HAVING count(*) > 1) x;

-- 7. Schema state. The expected change is ONE new table, "BookHarvestCheckpoint" (and its unique index on provider).
SELECT to_regclass('"BookHarvestCheckpoint"') IS NOT NULL AS checkpoint_table_already_present;

-- 7a. Tables the application expects that production does not have (zero rows = nothing else is waiting).
--     "BookHarvestCheckpoint" is expected to be the ONLY row.
SELECT m.t AS missing_table FROM (VALUES
    ('Publisher'), ('PublisherLocation'), ('PublisherContact'), ('PublisherAgreement'), ('AgreementTemplate'), ('PublisherMessage'),
    ('ReadEvent'), ('PublisherUpload'), ('Journal'), ('Article'), ('Book'), ('Chapter'),
    ('User'), ('InstitutionMemberAccess'), ('UserSession'), ('Payment'), ('Feedback'), ('Subscription'),
    ('SubscriptionRequest'), ('Quotation'), ('Receipt'), ('ContentModule'), ('Submission'), ('Content'),
    ('AccessRequest'), ('UsageLog'), ('Institution'), ('SeatPurchase'), ('StudentActivity'), ('Bundle'),
    ('ValidationReport'), ('AgencyInquiry'), ('ContactInquiry'), ('Lead'), ('LeadInteraction'), ('Coupon'),
    ('CouponUsage'), ('DemoRequest'), ('ExtractionJob'), ('ExtractionItem'), ('Favorite'), ('EmailVerification'),
    ('PageVisit'), ('BlogPost'), ('EmailEngine'), ('EmailRule'), ('EmailSend'), ('EmailLog'),
    ('MediaAsset'), ('TakedownRequest'), ('Author'), ('ArticleAuthor'), ('IngestionState'), ('LibraryEvent'),
    ('IngestionRun'), ('IngestionAudit'), ('IngestionPreview'), ('IngestionSourceHealth'), ('DepartmentSweep'), ('FreeSession'),
    ('Campaign'), ('AIConversation'), ('AIMessage'), ('BookHarvestCheckpoint')
  ) AS m(t) WHERE to_regclass('"' || m.t || '"') IS NULL ORDER BY 1;

-- 7b. "Book" columns the application expects that production does not have (zero rows = none).
SELECT c.col AS missing_book_column FROM (VALUES
    ('id'), ('title'), ('authors'), ('publisherId'), ('publisherName'), ('isbn'),
    ('doi'), ('year'), ('subject'), ('domain'), ('language'), ('country'),
    ('description'), ('coverUrl'), ('pdfUrl'), ('accessType'), ('status'), ('source'),
    ('fingerprint'), ('createdBy'), ('createdAt'), ('updatedAt'), ('rejectionNote'), ('edition'),
    ('metadata'), ('pages'), ('ownershipSource'), ('uploadId'), ('views'), ('accessStatus'),
    ('chapterCount'), ('lastIngestedAt'), ('licence'), ('licenceIsNC'), ('originalDate'), ('originalUrl'),
    ('rightsBasis'), ('rightsHolder'), ('rightsStatus'), ('rightsVerifiedAt'), ('rightsVerifiedBy'), ('sourceRecordId')
  ) AS c(col) WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Book' AND column_name = c.col) ORDER BY 1;

-- 8. Server clock and uptime (to line up with the backup timestamp in Coolify)
SELECT now() AS checked_at, pg_postmaster_start_time() AS postgres_started_at;

ROLLBACK;
