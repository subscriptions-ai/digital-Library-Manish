# OpenAlex Sources → Journal catalogue (2026-10-26)

Periodicals and Journals are one concept here. This lane adds Journals only; it never creates a Periodical table, and it never turns an
OpenAlex *repository* into a Journal.

## Root cause of the current `OpenAlex Sources` provider ("Exhausted for now")

1. **Narrow query.** The engine asks `/sources?search=<department term>&filter=type:journal,is_oa:true&page=N` — one relevance-ranked search per
   department term, by page number. It never walks the journal list; it re-reads the top of a few searches, and the top of each is dominated by
   journals DOAJ already supplied (584 of the first 1,000 open-access journals are DOAJ-listed and 583 of those are already held).
2. **Duplicates are "zero yield".** The rotation counts a turn as useful only if it created or enriched something. A page of duplicates advances the
   sweep position correctly, but three such turns in a row (`INGESTION_ZERO_YIELD_BATCHES_BEFORE_ROTATION`, default 3) set the provider aside for
   `INGESTION_EXHAUSTED_HOURS` (default 6) and the card reads "Exhausted for now".
3. **A search ends on a short page**, then reopens only after 30 days.
4. **No API key is sent anywhere.** OpenAlex now allows 1,000 credits a day per IP (shared with the article sources) without a key, and answers
   `HTTP 401 "API key required for cursor paging"` for any `cursor=` request after the first page. The Bulk-expansion OpenAlex path
   (`fetchOpenAlexSourcesCursor`) uses cursors and therefore cannot get past its first page without a key.

Other audit answers: OA is never verified from OpenAlex (`is_oa` / `is_in_doaj` are kept as a hint only), which is why OpenAlex-only journals are
written MetadataOnly ("OA unverified") or NeedsReview and never Accepted. Departments come from `journalDepartment(title, topic names)` and are
left empty when the evidence is not enough. Journals are matched on ISSN-L / ISSN / eISSN, then title + publisher; OpenAlex's own source id is not
stored on a Journal, so it cannot be matched on (no column is added for it).

## What was built (additive; the engine is unchanged unless switched on)

`src/lib/ingestion/openAlexJournals.ts`

* Query: `/sources?filter=type:journal,is_oa:true,has_issn:true&per-page=100&cursor=*` (75,810 sources on 2026-10-26), by cursor, position saved
  after each page is written, advanced even when the whole page is duplicates. Key from `OPENALEX_API_KEY` (never logged, never hard-coded).
* Tier A (`is_in_doaj`): deduplicated first; a new one is confirmed through DOAJ's API by ISSN and written by the DOAJ rule (Accepted only if every
  declared licence allows commercial use). If DOAJ cannot confirm it, it is treated as tier B.
* Tier B (open access, not in DOAJ): the existing OpenAlex rule, unchanged — MetadataOnly "OA unverified" when it has a title, ISSN, publisher and a
  supported department, otherwise NeedsReview. Never Accepted.
* Tier C (not open access): not requested, and skipped if one arrives.
* Held journals: only empty `eissn`, `publisherName`, `country`, `homepage`, `subjects`, `domain` are filled. Status, licence, access and rights
  basis are never touched; a journal held by agreement ("our own") is never touched; a disagreement (ISSN match but different title, or ISSNs that
  match two held journals) is a conflict and changes nothing. `startYear` is deliberately not written: OpenAlex's `first_publication_year` is the
  first year it holds works, not the year the journal began.
* Checkpoint: `AppSetting` key `ingestion.openalex-journals.v1` (no schema change). A **baseline** walk and a separate **incremental** walk; the
  baseline's `completedAt` is never reset by code. 429 / Retry-After sets a cooldown and does not move the position; a refused cursor stops the
  walk for a person; no key means no request. Pause flag supported.
* Incremental strategy: OpenAlex answers `Plan upgrade required` for `from_updated_date`, `from_created_date` and `sort=updated_date` on sources,
  so an updated-date window is **not** available on this plan. Incremental is therefore a full re-walk (~759 requests ≈ US$0.08) no sooner than
  `OPENALEX_JOURNALS_INCREMENTAL_DAYS` (default 30) after the last one finished.
* Engine: the standalone `OpenAlex Sources` provider uses the historical walk only when `OPENALEX_JOURNALS_HISTORICAL=1`; unset, it behaves exactly
  as before. A turn reads up to ten pages (1,000 sources) and stops at the first page that adds something, so duplicate-only stretches are walked
  past instead of being counted as empty turns. Complete → "Historical journal discovery complete — incremental monitoring active".
* Read-only status: `GET /api/admin/ingest/openalex-journals`; the same data rides on the `OpenAlex Sources` card in `GET /api/admin/ingest/sources`.
  `POST /api/admin/ingest/openalex-journals/pause {paused}` is audited.

## Future lane (not built): OpenAlex Repositories → Works/Locations → Article OA enrichment

Repository sources (`type:repository`) are useful for **Articles**: a work's `locations[]` / `best_oa_location` can supply an open copy and a landing
page for an article we already hold or are about to add. That lane must read repositories as *locations of works*, enrich Articles (OA link, version,
licence as stated by the location), and must never create a Journal from a repository name. It needs its own review of licence handling and the
same API key.

## Enabling it (after approval)

1. Create a free key at https://openalex.org/settings/api and set `OPENALEX_API_KEY` on the server (Coolify secret).
2. Set `OPENALEX_JOURNALS_HISTORICAL=1`. Nothing else changes; the checkpoint starts from the first page.
