# OpenAlex snapshot — audit before the Phase 2B adapter (2026-10-26)

Sources: OpenAlex's own documentation (help.openalex.org, "OpenAlex snapshot"), the bucket's `RELEASE_NOTES.txt`, the real `data/jsonl/works/manifest.json`,
and two real partitions downloaded for this audit (about 1.7 MB, 1,851 works). Nothing here is assumed; where the documentation and the files differ the files win.
Nothing larger than those two partitions has been downloaded, and nothing was run against production.

## The 12 questions

1. **Structure.** Works are one JSON object per line (JSON Lines), gzip-compressed, at `s3://openalex/data/jsonl/works/updated_date=YYYY-MM-DD/part_NNNN.gz`
   (a Parquet copy exists beside it; the adapter reads JSONL only). A Work has about 60 top-level keys (`id`, `doi`, `title`, `type`, `publication_year`,
   `publication_date`, `updated_date`, `is_retracted`, `is_paratext`, `open_access`, `primary_location`, `best_oa_location`, `biblio`, `authorships`, `primary_topic`,
   `abstract_inverted_index`, …). `works/` also holds `deleted_ids.csv.gz` (a deletion log) and `manifest.json`.
2. **Versions.** There is no version folder. A release is identified by the manifest's `date` (the real one says `2026-10-14`) with its `record_count`
   (464,765,485) and `content_length` (675,298,563,638 bytes); `RELEASE_NOTES.txt` lists each release. The free public snapshot is quarterly (second Wednesday of January, April, July, October).
   The manifest is written last: if it is there, the data is complete.
3. **Shards.** 1,898 part files in 396 `updated_date` partitions for Works; a part holds at most 400,000 records (largest seen: 985 MB compressed). Records are in the partition of the
   date they last changed.
4. **Compression.** One gzip member per file (checked on the real files). Node's `zlib.createGunzip` also handles concatenated members.
5. **Streaming.** Safe. Lines were 7 KB on average and 16 KB at most in the real fragment; a few Works elsewhere are much larger (long abstracts, many authors), so the reader caps a line
   (4 MB) and counts, rather than loads, anything larger. Streaming a real file grew the process by about 12 MB.
6. **Resumable unit.** A gzip file cannot be entered in the middle, so the checkpoint is **(file index, number of lines already consumed in that file)**, together with the snapshot's
   identity. A resume decompresses and skips the consumed lines without parsing them; within one worker the open reader is reused for the next page, so a normal run never re-skips. A
   crash recovery pays the skip once. Skipping is bounded by the job's own limits (maximum records, bytes, runtime).
7. **Which Works.** Only what the existing Article path already accepts: `type = article`, `primary_location.source.type = journal`, `is_paratext = false`, open access (`open_access.is_oa`),
   inside the job's window, **and published in a journal we already hold as Accepted with a DOAJ rights declaration** (matched on ISSN-L / ISSN / eISSN, and only journals that existed when the
   job was created). That is the rule the continuous engine uses for articles, so a journal is never created by a backfill and an article inherits its journal's department and rights context.
   Everything else is simply not relevant and is counted as scanned, not as a failure. A retracted work is relevant and is refused with a reason.
8. **Stable identifiers.** `id` (`https://openalex.org/W…`), also in `ids.openalex`; `doi` (a `https://doi.org/…` URL); `ids.mag`; `ids.pmid` / `ids.pmcid` where present. The adapter uses the W id as
   `sourceRecordId` (exactly as the engine stores it) and the DOI for the fingerprint. PMID / PMCID are not used (Phase 3).
9. **DOI.** 1,840 of 1,851 real works (99.4 %) carry one.
10. **Dates for later incremental use.** `updated_date` (also the partition folder), `created_date`, `publication_date`. A future incremental sync would read only partitions newer than the last
    release; not built here.
11. **Size.** Whole Works snapshot: about 675 GB compressed, several TB uncompressed. Free to download from S3 without an account (`--no-sign-request`). This adapter never downloads: it reads a **staged**
    copy (a folder an operator syncs deliberately) named by `OPENALEX_SNAPSHOT_DIR`. A development fragment is a few MB.
12. **A snapshot changing under a paused job.** Every page recomputes the staged snapshot's identity: the manifest's `date`, `record_count` and `content_length`, plus the relative path and size of every part
    file; each staged file's size is also checked against the manifest. The identity is written into the cursor. If it differs the job stops with `OPENALEX_SNAPSHOT_CHANGED`, the cursor and plan are kept
    as evidence, nothing is reset, and an operator starts a new job (which needs a new preview) against the new snapshot.

## Consequences for the design
- Checkpoint = `{v, id (snapshot identity), f (file index), n (lines consumed)}` in `BackfillJob.cursor`. No schema change.
- The page is a function of (snapshot, cursor, job window, the set of accepted journals that existed at job creation): repeatable, so the Phase 2A retry check applies unchanged.
- OpenAlex being the source never means "safe to publish": a licence is taken only from `best_oa_location.license`; a record without a verifiable open licence follows the existing judge (and "open access first" sends it to review); a file is
  offered only if it passes the same file check the engine uses (`verifyFiles`, default on), otherwise the record is catalogued as a link.

---

## Adapter as built (Phase 2B, 2026-10-26)

`src/lib/ingestion/backfill/openalexSnapshot.ts` (locate, identity, bounded streaming reader, work projection) and `openalexAdapter.ts` (the generic `BackfillAdapter` for ARTICLE). Shared judging and writing with the fixture:
`articleCommon.ts` (the engine's own judge, duplicate classes and writer). The adapter is **available only where `OPENALEX_SNAPSHOT_DIR` names a staged snapshot folder**; in production today it is not, so the screen says no provider is connected.

**Checkpoint** (`BackfillJob.cursor`): `{"v":1,"id":"<24-hex snapshot identity>","f":<file index>,"n":<lines consumed in that file>}`. At the end of the data the cursor is the end of the last file or null. The continuous engine's OpenAlex
checkpoint (`Journal.fetchCursor`) is never read or written.

**Per page** the reader consumes lines until `limit` relevant works are found (or the data ends); the page is returned with `meta = {scanned, notRelevant, tooLong, unparseable}` which the chunk keeps in its plan and adds to `config.sourceStats` once, on commit, like every other counter.

**Safety:** path confined to the staged folder (no absolute path, no `..`, symlinks resolved and re-checked); manifest sizes checked against the staged files; snapshot identity in every cursor; a changed snapshot raises `BackfillStop('OPENALEX_SNAPSHOT_CHANGED')`
(Failed, not retried, cursor and plan kept); a real start requires the preview's identity (`SOURCE_CHANGED_SINCE_PREVIEW`); a line over 4 MB is counted and discarded; at most one gzip reader is open and it is closed after 20 s idle or at the end.

**Rights:** nothing about OpenAlex makes a record publishable. Licence only from `best_oa_location.license`; a file is offered only if the engine's file check passes (`verifyFiles`, default on; off = links only); "open access first" can only turn a publish into a review; retracted works are refused; articles go only into journals already held as Accepted + DOAJ-declared (never a new journal), inherit that journal's department, and use the existing duplicate / enrichment / conflict rules.

**Not done here (by instruction):** no download, no full snapshot, no incremental sync from `updated_date`, no PMID / PMCID / arXiv identity (Phase 3), no other content type.
