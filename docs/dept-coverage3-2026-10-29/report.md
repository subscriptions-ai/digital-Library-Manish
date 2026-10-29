# Bio Technology, Electrical Engineering, Electronics & Telecommunication, continuation: 4 journals inserted (run `dept-coverage3-2026-10-29-45ec1cf6`)

Authorization: production insertion of additional eligible net-new journals under the established rules, within the remaining allowance of the combined ceiling of 2,000. Article ingestion, rights changes, reclassification of existing records, NeedsReview transitions, schema changes and deployments were out of scope and were not done.

## Result

**4 journals inserted** (Frequenz, JTEV (Jurnal Teknik Elektro dan Vokasional), Journal of Communication and Information Systems, Journal of Communications). **Ceiling accounting:** the previous run's 71 were re-verified in production on 2026-10-29 06:19 UTC (71 of 71 rows present, audit rows 25 + 46); 71 + 4 = 75 of 2,000, so **1,925 of the allowance remain unused**. The ceiling is not a quota and nothing was relaxed to approach it.

| Department | Total before → after | Public before → after | Public with a published article | NeedsReview | Inserted |
|---|---|---|---|---|---|
| Bio Technology | 778 → 778 | 443 → 443 | 272 → 272 | 335 → 335 | 0 |
| Electrical Engineering | 554 → 555 | 339 → 340 | 153 → 153 | 215 → 215 | 1 |
| Electronics & Telecommunication | 504 → 507 | 212 → 215 | 51 → 51 | 292 → 292 | 3 |
| **All journals** | **54,878 → 54,882** | MetadataOnly 16,431 → 16,435 | Accepted 12,840 unchanged | 25,607 unchanged | **4** |

Baseline re-measured from production at 06:44 UTC; nothing had been created by anyone since my snapshot. All four are `MetadataOnly`, `openAccess = false`, no licence, no rights verification, `rightsBasis = "OpenAlex listing — OA unverified"`, never Accepted. The other 84 journals that sit in a different department stay preview-only review candidates (`review-other-department.json`, unchanged).

## 1. The audit failure is fixed (before any further write)

`scripts/journal-source-apply.cjs` was rewritten and is covered by `scripts/test-journal-apply-transactional.ts` (16/16, in the private throwaway database `stm_journal_apply_test`, a copy of another test database; the test refuses any other database):

* **Validation before writes:** a row with a bad ISSN or e-ISSN check digit, an empty title, no department, or evidence over 64 KB is rejected, listed in the result and the audit row, and never written.
* **Sanitisation with the original preserved:** control characters and lone surrogates are removed from every evidence string (Postgres cannot store NUL). The audit row records which paths changed and keeps the **original evidence of each changed row as an escaped JSON string with its sha256**. The freeze script no longer strips anything: manifests keep the evidence exactly as collected.
* **One transaction per batch:** all journals of a batch and its audit row commit together or not at all. A write-time conflict rolls the batch back, the live check is repeated and the batch is retried (at most 3 attempts); any other failure stops the run (non-zero exit) with nothing partial in the database. Re-running a plan is idempotent and a run that inserts nothing writes no audit row.
* **Tested:** clean batch; idempotent re-run; NUL and control characters (sanitised, documented, original kept with matching sha256); invalid rows rejected while valid rows go in; simulated audit failure (nothing from the batch survives, exit 5) followed by a retry (each journal exactly once, one audit row, no duplicate ISSN); a simulated write-time race (rolled back, re-checked, retried, audit lists exactly the inserted ids); a failed batch stops later batches; the simulation flags are refused on any database not ending in `_test`. No failure path can leave an untracked inserted journal.

## 2. The 1,282 single-evidence candidates

Net-new journals found: 49,666 (the pool is rebuilt against the new baseline; 90,450 distinct journals; 39,610 already held by identifier; 1,174 title conflicts). Of the single-evidence group (1,324 in the fresh pool; 1,270 still held):

* **Homepages recovered from identity-matched records:** Wikidata (public SPARQL endpoint) by ISSN equality: 745 of the ISSNs of 875 candidates without a readable site have an official website; 95 of those sites could be read, 62 did not answer, 6 disallow automated access. Listed homepages were retried as https/http and www variants: 21 more became readable, 269 stay unreachable, 35 disallow robots. Wikidata subjects were not used as evidence (an aggregator).
* **Aims-and-scope pages:** the new readable sites and 611 sites that had answered without confirming a scope were read again at the standard locations (`/about`, `/about/editorialPolicies`, `/aims-and-scope` …), robots.txt respected, one request per host per second.
* **Societies not attempted before:** 7 more Crossref society deposits (KIEES ×2, IEEK, SICE, JSAEM, KSMB, MSMBB; 10 journals) and searches for 30 further national societies (IETE, Chinese, Korean, Polish, Serbian, Turkish and others) that have no Crossref deposits. They added no in-scope journal that was not already held.
* **Official exports:** the IEEE KBART title lists (an application behind an anti-bot layer; the ASPP brochure PDF has no list) and the Springer Nature Metadata Downloader (an interactive tool) could not be used programmatically; the Elsevier, Wiley, SAGE, T&F and IOP library list pages returned 403/404. None was bypassed. Broad fetches already completed were not repeated.

These steps lifted 54 of the single-evidence journals to two kinds of evidence in total (34 of them new compared with the previous run's pass); after publication evidence, publisher and rename checks **14 journals in all were eligible, and 10 of those I held by hand** (7 from the previous run's list plus *International Journal of Image Graphics and Signal Processing*, *Control Systems and Optimization Letters*, *International Journal of Information and Communication Sciences*: computing/control/ICT journals whose own scope pages do not confirm electronics, reasons in `hand-holds.json`). That leaves **4 inserted**.

## Held, by first failed gate (unique journals; 49,666 net-new = 47,200 out of scope + 2,452 held + 14 eligible; 14 = 4 inserted + 10 held by hand)

| Held reason | Count |
|---|---|
| One kind of department evidence; the journal's own site gave no usable aims-and-scope confirmation (unreachable, none found, robots-disallowed, or too little text) | 1,270 |
| Broad engineering/science title with no department term, supported only by topics and a website | 353 |
| Magazine, newsletter, proceedings, series, standard, technical review, trade serial | 227 |
| Publication evidence not enough (P-B) | 186 |
| Non-Latin title | 100 |
| No publication evidence found (P-C: mostly defunct NLM titles) | 79 |
| Multidisciplinary, bioinformatics, medical-microbiology titles | 50 |
| Computer-network / networking title (Computer / IT in the taxonomy) | 42 |
| General biology/microbiology title without a biotechnology term | 40 |
| Journal classifier names another department (Nano 28, Energy 20, Material Science 1, Management 1) | 50 |
| Near-identical title in the catalogue or rename/continuation | 14 |
| Site states publication has ceased | 11 |
| No publisher found | 9 |
| Identity unconfirmed (shared ISSN, different titles); invalid ISSN check digit | 16 |
| Evidence for several departments / equal evidence | 5 |
| Held by hand at freeze | 10 |

**Why the yield is 4:** with every source reachable by program, the journals that two independent kinds of evidence can place were already inserted in the earlier runs. What remains is mostly unresolved rather than invalid: the journal's site cannot be read (unreachable, no homepage, robots-disallowed), or only one kind of evidence exists. Reaching more needs a person or a licensed export to confirm scope.

## Verification

Dry run on live production: 4 would insert, 0 held, 0 clashes; live collision check against anything created since the snapshot: 0. Written in **one transaction** (journals + audit row, attempt 1, 0 rejected, 0 sanitised rows). Checks: 4/4 present; 0 field problems; 0 duplicate or cross-field identifiers; 0 same-title rows; 0 articles; **4/4 public detail pages** correct; a dry re-run skips all 4; the content hash of all 54,878 existing rows is unchanged; the audit row lists exactly the 4 written ids, ISSNs and departments.

## Audit, evidence, rollback

* Run id `dept-coverage3-2026-10-29-45ec1cf6`; production audit: `IngestionAudit`, action `JOURNAL_SOURCE_IMPORT`, `meta.runId` = the run id, 1 entry (4 journals).
* `manifest-frozen.json` with its checksum in `SHA256SUMS` and in `audit-manifest.json` was saved before the write (the tested code versions are the file hashes in the audit manifest).
* **Rollback (reviewed, NOT executed):** `DELETE FROM "Journal" j WHERE j.id = ANY(<4 ids>) AND NOT EXISTS (SELECT 1 FROM "Article" a WHERE a."journalId" = j.id)`; the only foreign key is `Article.journalId ON DELETE SET NULL`; articles, ingestion runs and library events referencing the 4 are all 0 (`rollback-review.json`).

## Tests

`test-journal-apply-transactional.ts` 16/16 (new), `test-dept-coverage2-manifest.ts` 13/13 on this manifest, `test-official-list-department.ts` 26/26 (now also KIEES, IEEK, SICE, JSAEM, KSMB, MSMBB bodies), `test-title-topic-department` 14/14, `test-journal-source-import` 39/39, `test-nlm-journals` 15/15, `test-openalex-journals` 60/60, `test-journal-quality` 52/52.
