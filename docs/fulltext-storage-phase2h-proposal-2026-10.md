# Phase 2H — private full-text storage: schema and storage proposal (2026-10-27)

**Status: proposal only.** Nothing here is applied. No schema was changed, no file was downloaded, no bucket, volume or scanner was
created, and no gate was turned on. The Prisma and SQL below were generated offline with `prisma migrate diff` between the current
`schema.prisma` and a proposed copy (no database connection); the proposed copy passes `prisma validate`.

It refines section 3 of `fulltext-candidate-review-and-storage-design-2026-10.md` (Phase 2G). Where the two differ, this one wins;
the differences are listed in section 9.

## 1. What exists today (checked in code on this date)

| Area | Fact | Consequence |
|---|---|---|
| Object storage | `src/server/storage/s3Storage.ts` uploads with `CacheControl: public, max-age=31536000, immutable`; `mediaStorage.ts` has drivers `s3`, `local-persistent`, `local-dev`. Both are for blog/media. | Not reusable as is: book files must never be public. |
| S3 client | Only `@aws-sdk/client-s3` is installed. `@aws-sdk/s3-request-presigner` is **not** in `package.json` or `node_modules`; it is only listed as a build external. The client has no `endpoint` / `forcePathStyle`. | Signed URLs need one new dependency; MinIO needs two settings. |
| Static serving | `server.ts` serves `UPLOAD_DIR` (`/app/uploads`) publicly at `/uploads`. | **Private books must not live under `/app/uploads`.** Use a separate root and volume. |
| Scanner | No malware scanner in code, `package.json` or deploy. | ClamAV is new infrastructure. |
| Validators | `pdfValidator.ts` and `books/fileCheck.ts` check a remote URL (HEAD, `%PDF-`). `pdfjs-dist` is a dependency. | A validator for a file on disk is new code; `pdfjs-dist` can open and count pages. |
| Reader | `/api/content/:id/view` returns `url: resolved.fileUrl` (`pdfUrl`) after `passesFreeClock`; reader endpoints serve any `pdfUrl` on a Published Book. `BOOK_FULLTEXT=1` is the harvest switch and is off. | A stored file must be reached through a new authenticated route, not through `pdfUrl`. |
| Publication | `publicationEligibility.ts` refuses a Book with `pdfUrl` or `ViewableHere`. | It must also refuse a Book with a live `BookFile` (section 6). |
| Jobs | `BackfillJob` already provides preview, pause, resume, cancel, one active job, checkpoint, audit. | The fetch job is a backfill adapter, not a new engine. |
| Removals | `TakedownRequest` has `RemoveFileKeepMetadata`. | Removal of a stored file hangs off that. |

## 2. Architecture

```text
Book metadata  → PostgreSQL                       (unchanged)
Candidate      → AppSetting row (Phase 2G)        (a person's Approve / Hold / Reject, with the source fingerprint)
Bytes          → private storage, content-addressed   books/fulltext/<sha[0:2]>/<sha256>.<pdf|epub>
Blob row       → StoredBlob   (one per distinct bytes: sha256, key, size, mime, scan result)
Book's claim   → BookFile     (one per Book: state, rights evidence, who approved, when)
Reader         → GET /api/books/:id/file  → entitlement check → short-lived URL or stream
```

Pipeline for one approved Book, in this order, stopping at the first failure:

1. **Claim** a `BookFile` row (`Pending`) inside a transaction that refuses a second live file for the Book.
2. **Re-verify live** against Open Library and the Archive using the audit's own rules (`olFulltext.ts`, unchanged): same fingerprint as the approval, still unrestricted, same allowed licence. A difference → `Held` (`source_changed` / `licence_changed`), back to review.
3. **Download** to a temp file, `archive.org` hosts only (3 redirects at most), one at a time, 2 s apart, named User-Agent, `Retry-After` honoured, SHA-256 computed while streaming. **Limit 100 MB** (section 5).
4. **Validate** the file itself (section 5).
5. **Scan** with ClamAV (section 5). Scanner unavailable → the job pauses; nothing is stored unscanned.
6. **Dedupe + store** (section 4), verify stored size and checksum.
7. **Record**: `StoredBlob` (insert, or reuse) and `BookFile.state = Stored` in one transaction, only after step 6 succeeded.
8. Temp file deleted in `finally`. `Book` itself is **not modified**: not `pdfUrl`, not `accessStatus`, not `status`, not licence.

## 3. Prisma proposal (additive: two new models, one relation field)

Adds the line `files BookFile[]` to `model Book`. That is a Prisma relation field only: **no column is added to "Book"** (see the SQL).

```prisma
/// One distinct file in private storage, identified by its bytes (Phase 2H). Two Books that point at the same bytes share one row and one object.
model StoredBlob {
  sha256    String   @id
  /// Object key (S3) or path under the private root (local). books/fulltext/<sha[0:2]>/<sha>.<format>
  key       String   @unique
  /// pdf | epub
  format    String
  /// Validated, not declared: application/pdf | application/epub+zip
  mime      String
  size      BigInt
  /// s3 | local-private
  driver    String
  /// Scanner and signature database that passed it, e.g. "clamav:1.4.2/27801". "none" is recorded, never hidden.
  scan      String
  scannedAt DateTime
  storedAt  DateTime @default(now())

  refs BookFile[]
}

/// A Book's claim on a stored file, with the rights evidence it was admitted under (Phase 2H).
model BookFile {
  id      String @id @default(uuid())
  bookId  String
  book    Book   @relation(fields: [bookId], references: [id], onDelete: Cascade)
  /// Null until the file is stored; the row exists from the moment a download is attempted so a failure is recorded against the Book.
  sha256  String?
  blob    StoredBlob? @relation(fields: [sha256], references: [sha256], onDelete: Restrict)
  /// Pending | Fetching | Scanning | Stored | Held | Failed | Removed
  state   String @default("Pending")
  /// Why it is Held or Failed (too_large, not_pdf, encrypted, active_content, malware, scanner_down, licence_changed, source_changed, ...). Never free text from the source.
  reason  String?
  attempts Int @default(0)
  nextAttemptAt DateTime?

  // ── Where it came from and why it was allowed ─────────────
  provider       String   // OpenLibrary | DOAB | OAPEN ...
  /// Internet Archive identifier (ocaid) or the provider's own file id
  sourceItemId   String?
  /// The file's address at the source. Evidence only: never served to a reader.
  sourceUrl      String?
  licence        String
  licenceUrl     String?
  /// The source fingerprint the person's approval was made against (fulltextCandidates.ts)
  candidateFingerprint String
  approvedBy     String
  approvedAt     DateTime
  rightsHolder   String?

  ingestedAt DateTime?
  removedAt  DateTime?
  removedBy  String?
  /// Why it was removed: takedown reference, licence change, admin decision
  removedFor String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([bookId])
  @@index([sha256])
  @@index([state, nextAttemptAt])
  /// A Book never holds the same bytes twice (NULL sha256, i.e. not yet stored, is not constrained). One live file per Book is enforced in code, in the claiming transaction.
  @@unique([bookId, sha256])
}
```

## 4. SQL proposal (what `prisma db push` would run; verified offline)

```sql
-- CreateTable
CREATE TABLE "StoredBlob" (
    "sha256" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "driver" TEXT NOT NULL,
    "scan" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL,
    "storedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredBlob_pkey" PRIMARY KEY ("sha256")
);

-- CreateTable
CREATE TABLE "BookFile" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "sha256" TEXT,
    "state" TEXT NOT NULL DEFAULT 'Pending',
    "reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "provider" TEXT NOT NULL,
    "sourceItemId" TEXT,
    "sourceUrl" TEXT,
    "licence" TEXT NOT NULL,
    "licenceUrl" TEXT,
    "candidateFingerprint" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "rightsHolder" TEXT,
    "ingestedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "removedBy" TEXT,
    "removedFor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoredBlob_key_key" ON "StoredBlob"("key");

-- CreateIndex
CREATE INDEX "BookFile_bookId_idx" ON "BookFile"("bookId");

-- CreateIndex
CREATE INDEX "BookFile_sha256_idx" ON "BookFile"("sha256");

-- CreateIndex
CREATE INDEX "BookFile_state_nextAttemptAt_idx" ON "BookFile"("state", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookFile_bookId_sha256_key" ON "BookFile"("bookId", "sha256");

-- AddForeignKey
ALTER TABLE "BookFile" ADD CONSTRAINT "BookFile_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookFile" ADD CONSTRAINT "BookFile_sha256_fkey" FOREIGN KEY ("sha256") REFERENCES "StoredBlob"("sha256") ON DELETE RESTRICT ON UPDATE CASCADE;
```

Rollback (only if nothing references the tables yet; `BookFile` first):

```sql
DROP TABLE "BookFile";
DROP TABLE "StoredBlob";
```

- Both tables are new and empty; no existing table is altered, no data is read or rewritten, no lock beyond creating the tables and two foreign keys (the `Book` foreign key is validated against an empty table).
- `ON DELETE CASCADE` from `Book` to `BookFile`: deleting a Book drops its claims. The blob is **never** deleted by that cascade (`ON DELETE RESTRICT` from `BookFile` to `StoredBlob`), so an unreferenced object is found by the orphan report and removed deliberately.
- **Deploy trap:** `npm start` runs `prisma db push` on every deploy. Merging the schema change to the deployed branch therefore applies it at the next deploy. The schema change must be its own commit, merged only after approval and after `npm run backup`.

### Deduplication by SHA-256

- Key = `books/fulltext/<sha256[0:2]>/<sha256>.<ext>`; `StoredBlob.sha256` is the primary key and `key` is unique, so the database refuses a duplicate even when two workers race.
- Order: hash while streaming → `INSERT … ON CONFLICT (sha256) DO NOTHING` → if the row already exists, **skip the upload** (verify with `HeadObject`/`stat`) and point the new `BookFile` at it → otherwise upload, verify, then record. An existing object is never overwritten.
- Same bytes under two Books = one object, two `BookFile` rows, each with its own licence and approval evidence. Rights are per Book, not per blob.
- A blob is deleted only when no live `BookFile` references it (takedown or removal), never by a failed run unless that run created it.

## 5. Size limit, validation and ClamAV

**Size: 100 MB** = 104,857,600 bytes (`BOOK_FILE_MAX_BYTES`; read as MiB — confirm). Refused from the Archive's listed size, again from `Content-Length`, and enforced on the running byte count. Over the limit → `Held: too_large`, not retried, listed for a person.

**Validation (the file, not the URL):** `%PDF-` magic, size equals listed size, not encrypted (`/Encrypt`), opens in `pdfjs-dist` with at least one page; `/JavaScript`, `/Launch`, `/EmbeddedFile` → `Held: active_content`, not stored. EPUB (only if approved for release 1): ZIP whose first entry is `mimetype = application/epub+zip`; at most 5,000 entries; uncompressed total ≤ 10× the compressed size and ≤ 300 MB; no executables. DRM wrappers (ACS / LCP) are rejected.

**ClamAV (recommended hard requirement):**

- A Coolify service in the same network, image `clamav/clamav` (clamd on TCP 3310, freshclam updating daily). It needs about 2 GB of RAM for the signature database (verify on the chosen image).
- clamd settings must allow the file: `StreamMaxLength 100M`, `MaxFileSize 100M`, `MaxScanSize 200M` (a 100 MB PDF scans slowly; allow minutes, not seconds).
- The app talks the clamd `INSTREAM` protocol over a plain TCP socket (length-prefixed chunks): **no new dependency**. `PING` before every job, `VERSION` recorded.
- Result handling: `OK` → store, `StoredBlob.scan = "clamav:<version>/<db number>"`; `FOUND` → file deleted, `BookFile` `Held: malware`, audit row, admin notified, the Book is never retried; error / timeout / scanner down → job **pauses**, nothing stored.
- Refuse to run if the signature database is older than 7 days. Nothing is ever recorded as scanned without a scan; `scan = "none"` exists only behind an explicit operator override and is shown in the admin screen.

## 6. Serving: authenticated route, short-lived URL

- `Book.pdfUrl` stays **null**; a bucket address is never stored on a Book.
- New `GET /api/books/:id/file`: authenticate; the Book must be `Published`; the same entitlement the viewer uses (`passesFreeClock` and the department entitlement resolver); a `BookFile` in state `Stored`, not `Removed`, not under an open takedown. Then:
  - **S3 driver:** a presigned GET, **5 minutes**, `ResponseContentDisposition: inline`, `ResponseContentType` from the validated mime. Needs `@aws-sdk/s3-request-presigner` (already a build external).
  - **Private local driver:** stream from the private root with `Range` support, `Cache-Control: private, no-store`.
- Reads are logged like any other read event (the viewer's `logEvent` path).
- **Private root:** `FULLTEXT_STORAGE_ROOT` (e.g. `/app/private-files`), its own Coolify volume, **outside** `/app/uploads`, never in `express.static`. For S3, a **separate private bucket** (`AWS_S3_FILES_BUCKET`), block-public-access on, SSE enabled; the blog bucket stays as is.
- `publicationEligibility.ts` gains one rule: a Book with a live `BookFile` is not auto-publishable (`access_not_publishable`), like one with `pdfUrl` today. The reader keeps showing it as Metadata Only until `BOOK_FULLTEXT` reader enablement and its QA are done.

## 7. Configuration (all new, all off or empty by default)

| Variable | Default | Meaning |
|---|---|---|
| `FULLTEXT_INGEST_ENABLED` | `false` | Master gate for the fetch job (preview is never gated). |
| `BOOK_FILE_MAX_BYTES` | `104857600` | 100 MB. |
| `FULLTEXT_STORAGE_DRIVER` | unset | `s3` or `local-private`; unset = the job refuses to start. |
| `FULLTEXT_STORAGE_ROOT` | unset | Required for `local-private`; must not be inside `UPLOAD_DIR`. |
| `AWS_S3_FILES_BUCKET`, `AWS_S3_ENDPOINT` | unset | Private bucket; endpoint for MinIO / path-style. |
| `CLAMAV_HOST`, `CLAMAV_PORT` | unset / `3310` | Scanner; unset = the job refuses to start. |
| `FULLTEXT_SIGNED_URL_TTL_SECONDS` | `300` | Reader URL lifetime. |

## 8. Build and test plan (after approval)

1. Schema commit alone (the two models); `db push` on a private test database only.
2. Storage module (driver switch, private root guard, S3 with endpoint, checksum verify) and ClamAV client, each with a fake server in tests: an `INSTREAM` stub for ClamAV, a fake Archive transport, an S3 stub or local MinIO.
3. Validator and fetch job as a `BackfillJob` adapter: preview first, one Book end to end on a fixture, then batches. Tripwires: `Book` row unchanged after every run; no request to any host but the Archive; no file stored when the scanner is down.
4. Tests: 100 MB boundary (at, over, lying `Content-Length`), duplicate bytes under two Books, racing workers, scanner `FOUND` / down / stale DB, encrypted PDF, JavaScript PDF, zip bomb, interrupted download cleanup, retry then permanent failure, takedown removal keeps the blob while another Book references it, route denies unentitled / unpublished / removed, signed URL expiry, `publicationEligibility` refuses a Book with a `BookFile`.
5. Local QA with a fixture PDF only. **No real full text is downloaded** until the first-Book step of the rollout is approved.

Rollout order (unchanged): storage health and scanner → preview → ONE approved Book → a small batch → the rest. At no step is anything published to readers automatically.

## 9. Changes from the Phase 2G design

- The size limit is 100 MB (the earlier draft said 150 MB).
- The presigner is **not** installed (the earlier draft said it was available).
- Two tables (`StoredBlob` + `BookFile`) instead of one `BookFile`, so deduplication is enforced by the database; the earlier "no-schema" fallback (`Book.metadata.fullText`) is dropped, because rights evidence, retries and removal need queryable rows.
- Private storage must be outside the publicly served `/app/uploads`.
- `publicationEligibility.ts` must refuse a Book that has a stored file.

## 10. Decisions needed

1. Approve the two models and the SQL above (applied by `db push` at a deploy).
2. ClamAV sidecar: yes or no; and may an unscanned file ever be stored (recommended: never).
3. 100 MB means 104,857,600 bytes?
4. PDF only in release 1, or EPUB too (recommended: PDF only).
5. Private S3 bucket, or a private Coolify volume for a single node.
6. Add `@aws-sdk/s3-request-presigner` as a dependency (needed only for the S3 driver).
7. Reader enablement (`BOOK_FULLTEXT`) is a separate product decision and is not part of this phase.
