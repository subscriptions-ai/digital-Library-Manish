# Nursing coverage completion and insertion: run `nursing-coverage-2026-10-29-79a08766`

Authorization: validated **net-new** Nursing journals only (canary ≤ 25, then batches ≤ 100). No validation was relaxed to reach a target; existing journals, the 827 NeedsReview status changes, article/full-text ingestion, licence changes and migrations are outside it.

## 1. Result in production (read-only measured before and after)

| | Before (05:04 UTC) | After (05:10 UTC) |
|---|---|---|
| All journals | 54,534 | 54,576 |
| Accepted / MetadataOnly / NeedsReview | 12,840 / 16,087 / 25,607 | 12,840 / **16,129** / 25,607 |
| Nursing Accepted / MetadataOnly / NeedsReview | 183 / 371 / 827 | 183 / **413** / 827 |
| **Nursing public** | **554** | **596** |

The 54,534 pre-existing rows are byte-identical (content hash `4a4a41ed…` before, after the canary and at the end): no existing journal was modified and no concurrent change touched them. `journalslibrary.com` (the public host) reports Nursing 596.

## 2. Visibility of the earlier 80 (investigated first)

The earlier run (`nursing-netnew-2026-10-28-8e430d72`, commit `45db9d9`) was **not** an unfinished run: all 80 were inserted and verified. Re-checked on the running production app (`NODE_ENV=production`, the container whose database host is the production one): 80/80 rows exist as `MetadataOnly`, department Nursing; `GET /api/library/department/nursing` swept page by page returns **554 = journalTotal**, every ISSN present (default and `sort=title`); `?q=` finds 12/12 by ISSN and by title; the public host returns the same total.
Why they can look "missing": the department page lists **100 per page, most articles first**. Journals with no published article (all MetadataOnly ones) sort after those that hold articles, so none of the 80 is on page 1; they are reached with "Show more" or the filter box (`PagedJournals`). Nothing is filtered out, no cache sits in front of the API (no `Cache-Control`, ETag only), and the `www` host's 503 is the known infrastructure fault, not this. **No fix was needed, so none was made**; no journal was re-inserted and no rights were changed. Evidence: `visibility-earlier-80.json`.

## 3. Source coverage (ledger: `coverage-ledger.json`)

| Source | Status | Fetched |
|---|---|---|
| OpenAlex, documented filter `topics.field.id:29` | complete | 15,947 of 15,947 (cursor exhausted) |
| CINAHL, 5 editions (coverage + subject lists) | complete | 33,485 coverage rows → 4,964 distinct academic-journal ISSNs; 593 under discipline Nursing |
| NLM Catalog, 31 Nursing-specific headings | complete | 3,614 serials (each heading's count = ids fetched) |
| DOAJ journal CSV (Nursing subject + multilingual terms) | complete | 23,554 read → 389 relevant (230 by subject) |
| SciELO ArticleMeta, **every** collection | complete | 36 collections, 2,280 journal records |
| KoreaMed + KAMJE | complete | 501 journals (210 renames linked) + 297 member rows |
| J-STAGE official journal list (public data) | complete | 4,509 journals |
| ISSN recovery (Crossref, exact title + publisher + unique) | complete | 1,871 attempted, 2 recovered |
| **INANE directory** | **blocked** | 0: Airtable `robots.txt` disallows `/shr*`; entries have no ISSN; exact manual-export request in the ledger |
| REVENF / BVS | blocked | 403 / unreachable |
| Elsevier, Wolters Kluwer, Wiley, T&F, Sage, Karger, Emerald, MDPI | blocked | 403 |
| Nursing society / publisher sites | partial | reachable sites publish no machine-readable list; ANA 403 |
| Japanese societies' own sites (outside J-STAGE) | not attempted | |

Previous raw data was lost with the scratchpad, so the sources were fetched again (checkpointed under `data/nursing-coverage/raw/`, SHA-256 in the ledger, never committed).
Records with no valid ISSN cannot be inserted: NLM 1,559, OpenAlex 377, J-STAGE 103.

## 4. The 1,753 candidates

| Step | Count |
|---|---|
| Records pooled from all sources | 18,525 |
| ISSN clusters | 14,217 |
| already in the catalogue (any status/department; includes the 80 + 32 of the NLM run) | 4,599 |
| same or base title as a catalogue journal: **title conflict, never net-new** | 220 |
| no independent Nursing evidence (general medicine/allied health, not counted) | 7,645 |
| **net-new candidates**: tier A 1,198 + B 384 + C 171 | **1,753** |

**Why 1,091 entered evidence collection and what happened to the other 662:** 1,753 − 171 (tier C: a title word is the only Nursing evidence, no calls) = 1,582 with scope A/B. Of these, **1,091** needed Crossref / OpenAlex / PubMed evidence. The other **491** did not: 199 were already shown current by data already fetched (OpenAlex counts, J-STAGE's own latest-publication date, SciELO status) and 292 are marked ended by a catalogue (NLM dates closed, CINAHL indexing stopped) with no recent work. 662 = 171 + 199 + 292. A later 584 candidates received one extra Crossref/OpenAlex identity check.

| Outcome (unique primary reason, order: ISSN, title, rename, non-journal, identity, scope, publisher, publication, single-source) | Candidates |
|---|---|
| **Inserted** | **42** |
| Eligible but held by hand after reading the titles (trade/newsletter, book series, same-title pair, scope ambiguity) | 12 |
| **Rejected** (a positive disqualifier): non-journal 206, ended 198, near-identical catalogue title / rename 34, NLM lineage relation 6, invalid ISSN 4 | 448 |
| **Held** (more evidence could change it): one Nursing signal only 353, no recent-publication evidence 578, Nursing scope insufficient 167, publication uncertain 73, only one source knows the ISSN 39, no publisher 36, identity unconfirmed 5 | 1,251 |
| **Total** | **1,753** |

Fetch failures were never read as "inactive": ceased needs a catalogue's positive statement and no recent work.

## 5. What qualified, and the 42 inserted

Mandatory: valid ISSN check digits; identity confirmed by at least two independent sources; strong Nursing scope (two independent subject signals, or one plus a nursing word in the title; the signals are NLM Nursing heading, CINAHL Nursing discipline, SciELO WoS area, OpenAlex ≥ 50% nursing topics, DOAJ Nursing subject, a nursing society/association); current publication (≥ 3 works 2024–26, or ≥ 1 plus an indexer's "current", or SciELO current, or **J-STAGE's own latest publication date in 2025–26**); a publisher; not a non-journal serial; no unresolved same-title conflict, rename or lineage. A nursing word in the title and "≥ 3 Crossref articles" were not required: 3 inserted titles have no nursing word and 23 qualify on an official platform statement (J-STAGE 21, SciELO 2).

| Source that lists it first | Fetched/pooled → | Inserted |
|---|---|---|
| J-STAGE | Japanese society journals, official latest-publication dates up to 2026-10-28 | 21 |
| OpenAlex | | 7 |
| NLM Catalog | | 6 |
| CINAHL | | 6 |
| SciELO | | 2 |
| **Total** | | **42** (any listing: CINAHL 23, J-STAGE 21, OpenAlex 18, NLM 15, SciELO 2) |

All are `MetadataOnly`, `openAccess = false`, no licence, no rights verification, `rightsBasis = "<source> listing — OA unverified"`: a source listing is not a licence, an OA verification, full-text rights or an indexing endorsement.

## 6. Previously held and NeedsReview (preview only)

* The earlier 1,384 held: 1,379 are found in this pool; **41 are now eligible, 33 of them are among the inserted 42** (mostly Japanese society journals now confirmed by J-STAGE); the movement matrix is in `previously-held-reassessment.json`.
* The 827 NeedsReview records: 742 re-scored with the new sources (A 384, B 142, C 215, X 1), linked to the earlier preview manifests by checksum (`needsreview-reassessment.json`). **No status change was made or proposed beyond that preview.**

## 7. Canary and batches

Dry runs on live production first (0 clashes). **Canary 25** (stratified by listing source): 25 inserted, 0 skipped, 0 failed; verified: ids equal the audit ids; fields as above; 0 duplicate ISSNs, 0 cross-field, 0 same-title, 0 articles; public detail page 25/25 (status, department, title, no licence, `openAccess` false); department listing 579 = 579 with all 25 present; existing-row hash unchanged. **Remainder 17**: one batch, 17 inserted, 0 skipped, 0 failed. Final: 42/42 rows, 42/42 detail pages, listing 596 = 596 (all 42 present), search 12/12. IDs were written to `batches/` right after each batch.

## 8. Tests, audit and rollback

`scripts/nursing-coverage/test_coverage.py` 22 passed (parsing, ISSN check digit, clustering, KoreaMed rename handling, no candidate in the catalogue, unique-primary reconciliation, frozen-set invariants), `scripts/test-nursing-expansion-manifest.ts` 16 passed, `test-journal-source-import.ts` 39, `test-journal-status-apply.ts` 16.
Audit: `IngestionAudit`, action `JOURNAL_SOURCE_IMPORT`, `meta.runId` = the run id (2 entries, 25 + 17). `audit-manifest.json` holds exact IDs, the full manifest checksum (`9f74b106f68dfa5a9958732e921621d7cfac89fb503d0243ca5219c9fccadae8`), code hashes and before/after. **Rollback reviewed, not executed:** scoped to the 42 ids (label alone is not a scope: OpenAlex label covers 6,270 rows); the only FK is `Article.journalId` ON DELETE SET NULL (0 references), so the `NOT EXISTS` guard is essential; the audit table has no FK.

## 9. Gaps and what is left

INANE (275 vetted journals), REVENF and the big publisher catalogues need a manual or licensed export. 1,251 held candidates (353 with one Nursing signal, 578 without recent-publication evidence) need the journal's own aims-and-scope or issue list. 1,559 NLM, 377 OpenAlex and 103 J-STAGE records lack an ISSN. Nursing is at 596 public, not 1,000; no criterion was relaxed to change that.
