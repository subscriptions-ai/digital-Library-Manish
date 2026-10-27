# Full-text candidate review (Phase 2G) and the storage design for the next phase

Nothing here downloads, stores or serves a book file, changes a Book, or enables anything. Phase 2G adds a way to *list* the audit's candidates and *record a person's decision*. The storage section is a design for a later, separately approved phase.

## 1. What was built

| Piece | Where |
|---|---|
| Candidate rows from the audit (title, author, year, ISBN, Open Library id, Archive id, department, licence, licence address, access, format, landing page, edition evidence) | `olFulltextAudit.ts` (`report.candidates`), `olFulltext.ts` (`evidence`) |
| Audit stepping and saving: `--after <book id>` continues where the last audit stopped; `--save` stores the candidates for review | `scripts/ol-fulltext-audit.ts` |
| Candidate store and decisions | `src/lib/ingestion/books/fulltextCandidates.ts` |
| Admin routes (SuperAdmin only): `GET /api/admin/books/fulltext-candidates`, `POST /api/admin/books/fulltext-candidates/:bookId/decision` | `server.ts` |
| Screen: Data Ingestion → **Full-text candidates** | `FullTextCandidates.tsx` |
| Tests | `scripts/test-fulltext-candidates.ts` (44), `scripts/test-ol-fulltext.ts` (55) |

### Where decisions are kept (no schema change)

One `AppSetting` row per candidate, `fulltext.candidate.v1:<bookId>`, holding the candidate row, the decision and a short history; plus one run summary, `fulltext.candidates.run.v1`. Two reviewers deciding different Books never overwrite each other. **No Book row is read for writing or changed**: status, department, licence, access, rights, `pdfUrl`, source address are untouched (the tests prove it with a Postgres trigger on `"Book"`).

If the review grows into a real workflow, a dedicated `FulltextCandidate` table would be cleaner. That is an additive schema change and would be proposed with its exact diff first.

### The rules the server enforces

- **Approve for future ingestion** is refused (409, with the reasons) unless **both** hold: the edition is confirmed (the Archive item names this Open Library edition, shares its ISBN, or for a work-level Book its work) **and** the declared licence is one the existing book policy allows (CC0, Public Domain Mark, CC BY, CC BY-SA, CC BY-ND) on an item that is openly readable, not access-restricted, with a PDF/EPUB. Also refused if the candidate is stale, or the Book's Open Library id or ISBN changed since the audit.
- `full`, downloadable, borrowable, preview and the Archive's "possibly out of copyright" flag are never enough on their own. Anything unclear: **Hold** (always allowed). **Reject** needs a reason.
- A decision records who, when, the note, and the **source fingerprint** it was made against. If a later audit finds the source facts changed, the approval is flagged **"Approved — look again"**; if the Book stops being a candidate it is marked **stale** and cannot be approved again. Decisions are never deleted by an audit.
- An incomplete audit (budget, outage) or a partial one (`--limit`, `--after`) never marks anything stale.
- The licence is the **uploader's declaration** on the Archive item. An approval means "worth ingesting", not "verified rights"; ingestion must re-check the live source first (below).

## 2. Production audit — not run from here

The production database is an internal Coolify host (`…:5432/postgres`); it cannot be reached from the development machine, and the production credentials are deliberately not used here. So the production counts below are **not measured**. The only measured population is the dev catalogue (99 Books, 0 candidates; see the Phase 2F document).

Run it on the server (Coolify terminal for the app container), gradually. Every step is read-only except `--save`, which writes only the candidate list as `AppSetting` rows:

```
# 1. a first sample; read the whole report, the request counts and any rate-limit or failure lines
npx tsx scripts/ol-fulltext-audit.ts --limit 200 --json /tmp/ol-200.json

# 2. if healthy (no failures, no 429s, "UNCHANGED" on every safety line), widen
npx tsx scripts/ol-fulltext-audit.ts --limit 2000 --json /tmp/ol-2000.json

# 3. then step through the rest with --after (the last id of the previous step is printed as "last Book audited")
npx tsx scripts/ol-fulltext-audit.ts --limit 5000 --after <last id> --json /tmp/ol-next.json

# 4. a final whole-scope run (no --limit/--after), saving the candidates for the screen
npx tsx scripts/ol-fulltext-audit.ts --save --json /tmp/ol-all.json
```

Cost: one request per 20 Books for the editions plus one per openly readable item, 1.1 s apart; 5,000 Books is roughly 5–10 minutes. The report gives: scanned, matched, candidates, Public Domain / CC0 / CC BY / CC BY-SA / CC BY-ND counts, borrow-only, preview-only, licence unknown, restricted, no file, ambiguous, unmatched, could-not-check, candidates by department and by provider (`source`), and before/after fingerprints (Book table, provider health, settings, sweeps, counts). If any source fails repeatedly it stops and says it is incomplete; nothing is guessed.

## 3. Storage design (for the next phase; not built)

```text
Book metadata   → PostgreSQL            (what we hold today; unchanged)
PDF / EPUB      → object storage        (private bucket, content-addressed)
Book            → object/file reference (key + checksum + size + type + rights evidence)
```

### What exists today

- `src/server/storage/s3Storage.ts` / `mediaStorage.ts`: an S3 client and a driver switch (`s3` | `local-persistent`), built for **blog media**: objects are **public** with `Cache-Control: public, immutable`. Not suitable for books as is: a book file must be served only to entitled readers.
- `@aws-sdk/client-s3` and the presigner are available (the presigner is a build external); `@aws-sdk/lib-storage` (multipart upload helper) is **not** installed. The client has no `endpoint` / `forcePathStyle` setting, which a MinIO (S3-compatible, used locally) needs.
- `src/lib/pdfValidator.ts` and `books/fileCheck.ts` validate a **remote URL** (HEAD, first bytes `%PDF-`, content type); there is no validator for a file on disk. **No malware scanner** exists in the code or the deploy.
- The reader does not consume Book files yet (`BOOK_FULLTEXT=1` is the switch; "TODO BOOK_FULLTEXT_READER_ENABLEMENT" in `normalise.ts`). A `TakedownRequest` table exists for removals.

### Design

1. **Eligibility.** An approved candidate whose Book is still Metadata Only with no file, not stale, not "look again". The job is a `BackfillJob` adapter (pause / resume / cancel / audit / one active job, preview first, `FULLTEXT_INGEST_ENABLED` off by default) with the checkpoint being the last Book id. Preview lists what *would* be fetched and fetches nothing.
2. **Re-verify live, immediately before download.** Ask Open Library and the Archive again; the source fingerprint must equal the one the decision was made against, the item must still be unrestricted and carry the same allowed licence. Any difference → stop for that Book, mark it "look again". The audit's rules (`olFulltext.ts`) are reused unchanged.
3. **Download** only the approved file, from `archive.org` hosts only (up to 3 redirects, no other host). Streamed to a temp file, never buffered whole; hashed (sha-256) as it streams. One download at a time, at least 2 s apart, named User-Agent, `Retry-After` honoured. **Size limit** `BOOK_FILE_MAX_BYTES` (default 150 MB): refused from the Archive's listed size and again from `Content-Length`, and enforced on the running byte count.
4. **Validation** on the file itself: magic bytes (`%PDF-`; EPUB = a ZIP whose first entry is `mimetype` = `application/epub+zip`), size equals the listed size, not encrypted (`/Encrypt` or DRM wrappers are rejected), PDF structure opens and has pages; EPUB: entry count and total uncompressed size and ratio limits (zip-bomb guard), no executables. PDFs with `/JavaScript`, `/Launch` or `/EmbeddedFile` are held for review, not stored. **Malware scanning:** nothing exists today. Recommend a ClamAV sidecar (`clamd` over TCP) as a hard requirement before the first file is stored; the record carries `scan: "clamav:<version>" | "none"` so an unscanned file is visible, and ingestion refuses to run without a scanner unless explicitly overridden by an operator.
5. **Storage.** Private bucket (or the persistent volume driver for a single-node deploy). Key `books/fulltext/<sha256[0:2]>/<sha256>.<pdf|epub>`: **content-addressed**, so **deduplication** is free (the same bytes under two Books are one object; check with `HeadObject` before uploading, and never overwrite). `Content-Type` set from the validated type, `Content-Disposition: attachment`, no public ACL, server-side encryption. Upload verifies the stored size and checksum (`ChecksumSHA256`) before anything is recorded. Multipart for large files needs `@aws-sdk/lib-storage` or a manual multipart upload (a dependency decision for that phase). For MinIO, add `AWS_S3_ENDPOINT` / path-style to the client.
6. **Reference.** Preferred: an additive `BookFile` table (`bookId`, `key`, `sha256`, `size`, `mime`, `format`, `ocaid`, `licence`, `licenceUrl`, `approvedBy`, `approvedAt`, `ingestedAt`, `scan`) with the exact diff proposed and approved first. Without a schema change, the same facts go in `Book.metadata.fullText`. Either way `Book.pdfUrl` is **not** set to a bucket address: it points to an authenticated route that checks entitlement and returns a short-lived presigned URL (5 minutes). Access stays Metadata Only until the reader supports Book files (`BOOK_FULLTEXT=1`) and the access/security QA is done. Licence and attribution travel with the file, so a takedown can remove it by Book id.
7. **Failure cleanup.** The temp file is deleted in a `finally`. An object this run created but could not record is deleted (an already-existing deduplicated object is never deleted by a failed run). The database is written only after upload and verification succeed, so a failure leaves the Book exactly as it was. A report (never an automatic delete) lists objects under the prefix that no Book references and that are older than 24 hours.
8. **Retry policy.** Transient failures (timeout, network, 5xx, 429) retry up to 3 times at 1 min / 10 min / 1 h, honouring `Retry-After`, with the same circuit breaker the audit client uses (stop after repeated failures; report incomplete). Permanent failures (404, validation failure, size cap, checksum or size mismatch, licence changed) are **not retried**: the Book is marked failed with the reason and returns to review.
9. **Rollout order.** Storage health and a scanner first; then a preview; then ONE approved Book end to end; then a small batch; then the rest. At no step is anything published to readers automatically.

### Open decisions for that phase

- ClamAV sidecar: yes/no, and whether an unscanned file may ever be stored.
- `BookFile` table versus `Book.metadata.fullText`.
- The size limit, and whether EPUB is accepted at all in the first release (PDF only is simpler to validate).
- Whether the reader (not this work) is ready to serve a Book file.
