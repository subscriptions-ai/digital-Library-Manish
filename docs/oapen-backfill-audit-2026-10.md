# OAPEN — audit before the Phase 2C adapter (2026-10-26)

Sources: the live OAPEN OAI-PMH endpoint (`Identify`, `ListMetadataFormats`, `ListSets`, one full real `ListRecords` page, and — for this audit and again in Test C — a handful of
further pages), OAPEN's own metadata documentation, and OAPEN's published bulk metadata CSV. Nothing here is assumed; where documentation and the live service differ the live service wins.
Nothing was run against production. **Disclosure:** probing the bulk file with a `Range` request downloaded all of it (the server ignores `Range`): 110 MB, once, into the scratch folder, where it
was profiled and then left unused. Nothing from it was written anywhere.

## The 11 questions

1. **Official bulk / OAI options.** Two, both public and unauthenticated.
   * **OAI-PMH** at `https://library.oapen.org/oai/request` (protocol 2.0, DSpace/xoai). Sets include **Books** (`com_20.500.12657_5`), Book chapters, Publishers, Funders, a dark archive.
   * **Bulk CSV** of the whole library at `https://memo.oapen.org/file/oapen/OAPENLibrary.csv` (110 MB, 53,134 rows, 39 columns). It is a snapshot with no version, no modification date on the
     file, and no `Range` support.
2. **Metadata format.** OAI offers `xoai`, `oai_dc`, `qdc`, `mods`, `mets`, `didl`, `ore`, `dim`, `marc`, `rdf`, `etdms`, `uketd_dc`, `doab_migration`. **`xoai`** is the only one that carries the DOI, ISBNs,
   publisher, subject codes, cover and — decisively — a licence declaration per file (`rights` / `rightsuri` on the bitstream). It is what the continuous OAPEN and DOAB harvests already read.
3. **Pagination / resumption.** 100 records per page (fixed by the server). The resumption token is **stateless**: `xoai/<from>/<until>/<set>/<offset>`, e.g. the real page 2 of a job closed at
   `2026-10-26T09:51:14Z` was `xoai//2026-10-26T09:51:14Z/com_20.500.12657_5/100`. The `until` we send is carried into every later token, so a list closed at the job's creation stays closed.
   `completeListSize` is reported (51,164 for Books). No token expiry was observed; a refused token answers `badResumptionToken`.
4. **Volume.** About 51,164 records in Books (OAI) / 53,134 rows in the CSV (whole library). A full OAI walk is about 512 pages of ~0.95 MB, ~490 MB of XML.
5. **Identifiers.** Handle (`oai:library.oapen.org:20.500.12657/<n>`, always present, stable). On a real 100-record page: DOI ~86 %, ISBN ~87 %. CSV: DOI 86.6 %, `oapen.relation.isbn` 51.7 %.
   Identity in the catalogue: DOI, then ISBN (10 and 13 are one book), then the OAPEN handle (`Book.sourceRecordId` with source `OAPEN`, and the fingerprint `oapen:doi:…` / `oapen:handle:…`).
6. **Licence fields.** In OAI, per file (`rightsuri`, `rights`), which is evidence about *this title*; ~86 % of titles carry one. The CSV has one `BITSTREAM_License` (96.1 % non-empty) but in many spellings
   (`…/by/4.0/`, `http://…`, `…/legalcode`, no trailing slash, "All rights reserved" ×1,672, blank ×2,085), so it would need its own normaliser and its own rights tests. A publisher-wide statement is the
   weaker, fallback evidence the existing reader already distinguishes (`licenceBasis` title / publisher-statement / none).
7. **File fields.** `ORIGINAL` bundle bitstream: `url`, `format`, `size`, `checksum`; ~97 % of titles list a PDF. A listed file is a claim, not a fact: OAPEN puts downloads behind a bot check that answers
   an automated request with a web page, which is why the engine verifies the first bytes (`FileChecker`). Source ≠ permission to host.
8. **Date metadata.** `dc.date.issued` (publication; a year or a full date; 100 % present; some are malformed — a handful of future years — and 1,826 CSV rows are before 2000), `dc.date.accessioned` /
   `available`, and OAI `datestamp` (when the record last changed, seconds granularity). `earliestDatestamp` 2020-03-26T09:27:40Z. `deletedRecord=transient`: a withdrawn title is a header with `status="deleted"`.
9. **Checkpoint unit.** A RECORD, never an offset: (token of the page that holds the newest record read, token of the page before it, the handles of the last three records read) plus the source
   identity. See the checkpoint format and "No record is skipped" below. The CSV has no unit smaller than the file (no `Range`).
10. **Rate limits and resources.** None published. The adapter asks at most once per second (`BACKFILL_OAPEN_REQUEST_GAP_MS`), reads at most 5 pages per chunk, honours HTTP 429/503 and `Retry-After`,
    and reads the continuous engine's health row for OAPEN before every request (see "Independence"). A page is ~1 MB; the worker holds one page at a time (measured: see the report).
11. **OAI or bulk?** **OAI-PMH (`xoai`, Books set).**
    * The same records, the same normaliser and the same rights reading as the continuous harvest, so a book means the same thing whichever path brought it; no second licence normaliser.
    * It reports deletions and per-record datestamps; the CSV does neither.
    * It is resumable and verifiable (stateless token, record count, page hash for the framework's retry check); the CSV cannot be entered in the middle and cannot say whether it changed.
    * It needs no operator to stage a 110 MB file, and the 5,000-records-per-job default keeps a job to about 50 requests.
    * Cost: ~512 requests for a complete walk (spread over many jobs at the default limits), where the CSV is one download. The CSV remains the documented alternative if load on OAPEN ever becomes a concern
      (it would be a "staged file" source like OpenAlex's, with its own normaliser).
    * The one real hazard of OAI paging is that a token is only an offset: a record that changes at OAPEN after the job's closing time leaves the closed list and every later record moves one place
      towards the front, so a reader that resumes by offset jumps over the record that moved into the gap. The adapter does not resume by offset (next section).

## Adapter as built

`src/lib/ingestion/backfill/oapenSource.ts` (the reader), `bookCommon.ts` (judging and writing books), `oapenAdapter.ts` (the generic `BackfillAdapter` for BOOK). Generic additions: `BackfillWait` (see below).
**Available only where `BACKFILL_OAPEN_ENABLED` is set at deployment time** (on top of `INGESTION_BACKFILL_ENABLED`); in production today it is neither, so the screen offers no OAPEN.

**Checkpoint** (`BackfillJob.cursor`): `{"v":2,"id":"<24-hex source identity>","t":"<token of the page holding the newest record read; '' = first page>","p":"<token of the page before it, or null>","a":[handles of the last three records read, newest first]}`.
A finished job has no cursor. The source identity hashes the endpoint, set, format and the job's optional change window, so a checkpoint is only ever resumed against the source it was taken on
(`OAPEN_SOURCE_CHANGED` otherwise). The cursor is under ~1.1 KB. No schema change.

**No record is skipped (at-least-once read, idempotent write).**
* A chunk resumes by re-reading the page that holds the last record it read and continuing **after that record, found by its handle** — not by its index. If the record has moved onto the previous page (`p`) it is found there
  (`rewound`). A newer anchor that has itself left the list is passed over for an older one of the three. If none of the three can be found on either page the job **stops** (`OAPEN_FEED_CHANGED`, Failed, checkpoint kept, nothing guessed).
* Moving from page k to page k+1 inside a chunk, it then **reads page k again and compares the handles on it**. If they differ, something left the list in between and a record may have moved from k+1 into k's tail:
  the fresh page k is taken, the read continues after the last record read (picking up what moved), and the advance is tried again (`reread`; at most 5 times, then an ordinary retryable error).
* A record may therefore be looked at twice; it is then judged again, found held, and counted as a duplicate. It is never written twice (the write is idempotent: DOI, ISBN and the OAPEN handle). A record that left
  the list before it was read is simply not in the closed list any more; the continuous harvest will see it as changed.
* Cost: about one extra OAI request at the start of a chunk and one per page advance. Chunk retry safety is unchanged (the framework still compares the page's identity).
* Proof: `scripts/test-backfill-oapen.ts` §5b — the hazard shown on the fake feed; chunks that end inside a page while 68 records leave around the boundary; three more random-departure runs (800 records, 1–3 records leaving
  between every chunk); a record leaving between two page requests of one chunk; the checkpoint's records moving onto the previous page; the two newest and then all three anchors leaving; held duplicates, feed repeats and
  conflicts in play. Every run: no record that stayed in the list missing, no duplicate book, no book from nowhere.

**Settings (adapter parameters):** `verifyFiles` (default on: the engine's own file check; off = links only), `modifiedFrom` / `modifiedUntil` (optional OAI datestamps; they narrow the feed by when OAPEN last
changed a record, not by publication year). The screen's **publication period** is applied on top, by `dc.date.issued` (a year is the whole year): a record outside it, or with no date when a period is set, is
counted and skipped. **Departments**, **access preference** and **maximum records** work as for every backfill.

**Per chunk:** read until `limit` relevant records are found, the feed ends, or the chunk has moved forward through 5 pages. Not relevant — counted in `sourceStats`, never written — are deletion notices (`deleted`),
records with no title (`unusable`), and records outside the period (`outsideWindow`, `noDate`). `requests` counts OAI requests, `pages` pages moved through, `rewound` / `reread` the recoveries above.

**Rights (nothing about OAPEN makes a book publishable):**
* A new book goes through the engine's own pipeline: duplicate detection, department classifier, licence/access judge, book year policy.
* *Published* only when the classifier places it with confidence, the year is within the book policy (2000+ by default), and — under "open access first" — it has a verifiable commercial-use licence.
  Otherwise a **Draft with no department** (unclear department; older than the policy year; no year; no verifiable licence). *Refused* (not catalogued): no reliable department, or outside the selected departments.
* Access: a title-level licence is recorded as such; no licence = Metadata Only, hostable = no. A file is verified before it is even recorded as usable. While the Book reader does not serve full text
  (`BOOK_FULLTEXT` unset), nothing is ever Full Text or has a file URL: books are links. With it on, a file is offered only for a commercial-use licence **and** a file whose first bytes are a PDF.
* A **held** book (DOI, ISBN or the OAPEN handle matches) is *enriched* only in its EMPTY descriptive fields, plus an empty licence when OAPEN declares a recognised licence for that very title, plus the OAPEN
  provenance in `metadata.sources`. Never written: licence that is already there, DOI that is already there, access status, rights status/basis, status, department, file link. A **conflict** (licence family
  or DOI disagrees) is counted and **no Book column changes**. For a *licence* conflict the existing evidence note is kept, exactly as the continuous harvest keeps it: `Book.metadata.licenceConflicts.OAPEN =
  {held, theirs, handle, seenAt, status: "needs human review"}` — one bounded entry per provider, merged beside the other metadata keys, rewritten only when the disagreement is a different one, never read by a screen
  or an API, never for a protected book, never for a dry run, never when INGESTION_MULTI_SOURCE_ENRICHMENT=0. A DOI disagreement is counter-only. A book that is rejected, owned by a publisher or an administrator, or whose rights a person decided is never touched. A
  **title-only** match is reported as "already held" and nothing is written — titles are never merged.
* A book that appears twice in the feed is judged against its first sighting exactly as it would be against the row that sighting wrote (same licence → unchanged, another licence → conflicting), in a dry
  run and a real run alike.

**Independence from the continuous engine:** the checkpoint is the job's. The adapter never reads or writes `BookHarvestCheckpoint` (whose `cursor` is the continuous harvest's resumption token), the
rotation, Quick Import, or the sweeps. It uses its own HTTP (not `fetchSourceJson`) and **never writes `IngestionSourceHealth`**; it reads that row before every request and, if OAPEN is resting or the engine
is due to re-test it (a probe), the job waits instead of asking. Its lock is the engine's own key (`OAPEN`), held for one chunk.

**`BackfillWait` (generic):** an adapter may say "ask me again later" (HTTP 429/503 with `Retry-After`, the engine's breaker open or probing). The chunk is not run, nothing is counted, there is no error
streak and no failure; the job stays Running with `config.waiting = {reason, until}`, is not asked of the source again before `until`, and carries on afterwards.

**Not done here (by instruction):** no full OAPEN import, no incremental sync from `datestamp`, no CSV mode, no Book chapters set, no title-similarity merging, no Phase 3 identity, no other provider. No schema change.
