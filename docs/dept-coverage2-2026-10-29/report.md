# Bio Technology, Electrical Engineering, Electronics & Telecommunication: 71 new journals inserted (run `dept-coverage2-2026-10-29-a8f54e56`)

Authorization: database-only insertion of validated net-new journals for the three existing departments, up to 2,000 in total. Article ingestion, rights changes, reclassification of existing records, NeedsReview transitions, schema changes and deployments were out of scope and were not done.

## Result and target shortfall

**71 journals were inserted against a target of "up to 2,000". The shortfall is 1,929 and is real, not a pause:** every candidate that passed the validation rules was inserted, and nothing was relaxed to approach the target. The reasons are in "Why the supply is this small" below.

| Department | Total before → after | Public before → after | Public with a published article | NeedsReview | Inserted |
|---|---|---|---|---|---|
| Bio Technology | 764 → 778 | 429 → 443 | 272 → 272 | 335 → 335 | 14 |
| Electrical Engineering | 539 → 554 | 324 → 339 | 153 → 153 | 215 → 215 | 15 |
| Electronics & Telecommunication | 462 → 504 | 170 → 212 | 51 → 51 | 292 → 292 | 42 |
| **All journals** | **54,807 → 54,878** | MetadataOnly 16,360 → 16,431 | Accepted 12,840 unchanged | 25,607 unchanged | **71** |

Baseline measured from production on 2026-10-29 06:08 UTC after the previous run (its 231 journals are in it); the screenshot figures were not used. "Public" is the product's rule (Accepted or MetadataOnly). New journals have no articles, so the published-article column cannot move. Every inserted journal is `MetadataOnly`, `openAccess = false`, no licence, no rights verification, `rightsBasis = "<source> listing — OA unverified"`, never Accepted. No journal was placed in two departments, and no existing record was changed.

**Per source (the source that listed the journal; a journal listed by several counts once under its first source):** OpenAlex 65 (Bio 12, Electrical 13, Electronics 40), Crossref society deposits 4 (IEEJ 2, Optica 2), NLM Catalog 2 (Bio 2). Also listed by J-STAGE: 2; by SciELO: 0. Source counts overlap and are not additive.

## Baseline, concurrency and idempotency

* Production: the STM application container and its database (`postgres`) on the Coolify host; no other tenant was touched. Credentials are not stored in the repository (`prod.sh` takes the host and key from the environment).
* Active imports at 05:29 UTC: none that write journals. The platform's own engine was running article/book ingestion and held-candidate review (it does not create journals); the last `JOURNAL_SOURCE_IMPORT` was the previous run's final batch. Nothing created journals between my snapshot and my first write (checked by count, by `createdAt` and by exact IDs before every batch). Another session's Nursing commit had landed earlier and the working tree was clean.
* Safeguards used: the create-only writer (`journal-source-apply.cjs`) re-checks every identifier and title against the live table before each insert; the unique ISSN constraint backs it; a separate live collision check (`live_check.py`) covers near-identical titles against anything created since the snapshot.

## Source coverage (complete / partial / blocked)

All queries, retrieval times, counts and raw-file checksums are in `coverage-ledger.json` (this run) and the previous run's ledger (IEEE/ASME/IET/JSME/IEICE, first NLM set, first OpenAlex pools, DOAJ). Raw bulk downloads are not committed.

| Source | Status | Read | Distinct journals | Already held | Title conflict | Net-new |
|---|---|---|---|---|---|---|
| OpenAlex sources, 15 documented filters (previous 13 + biotech2 9,047 + elec2 13,725) | complete | 168,941 records | 71,104 | 25,470 | 1,031 | 44,603 |
| NLM Catalog, 2 subject sets (10 + 13 NLM Subjects) | complete | 6,340 serials (4,076 distinct journals with ISSN) | 3,853 | 1,118 | 90 | 2,645 |
| Crossref publisher deposits: IEEE 276 journals, IET 51, IEICE 8, ASME 31, JSME 39 (run 1) + IEEJ 8, KIEE 1, KIEEME 1, Optica 15, ITE 2, EMA 5, ICROS 1, KSBB 1, JSBBA 1, SPIE 14 (this run) | complete | 454 journal records | 450 | 264 | 10 | 176 |
| J-STAGE official public-data list (reused) | complete | 4,509 | 3,566 | 385 | 56 | 3,125 |
| SciELO ArticleMeta, all collections (reused) | complete | 2,280 | 2,197 | 1,467 | 39 | 691 |
| DOAJ CSV | complete | 23,554 | 23,520 | 23,496 | 21 | 3 |
| Journal websites (aims and scope) | **partial** | 2,253 candidates | 1,080 read; 579 unreachable; 506 no homepage found; 88 robots.txt disallowed | | | |
| IEEE Xplore title browse / Publishing Portal | **blocked** (JavaScript application; not bypassed) | | | | | |
| IET Digital Library, SAGE (IMechE), ScienceDirect, EurekaSelect | **blocked** (HTTP 403; not bypassed) | | | | | |
| Society sites outside J-STAGE/Crossref (e.g. other national electrical and biotechnology societies) | not attempted | | | | | |

IEEE and IET are represented only by their own Crossref deposits (the societies' title pages cannot be read automatically). A journal found by several sources counts once; the "Distinct journals" column counts a journal under each source that lists it, so the rows overlap. Overall: **90,450 distinct journals** were merged by shared ISSN; **39,539** already exist in the catalogue by identifier (any status, any department), **1,172** share a normalised title with a held journal under other identifiers (held, never merged), leaving **49,739 net-new**.

## How a journal qualified

* Valid ISSN check digits; identity (every record sharing an ISSN carries the same title; title from Crossref/OpenAlex must match); a publisher from the listing or, if none, from Crossref/OpenAlex only when the returned title matches (37 of the 71, recorded per row).
* **Department evidence of at least two different kinds that agree** (title term, society/publisher list, a catalogue subject, OpenAlex topics, and the journal's own aims and scope), and no contradiction. Topics alone never place a journal; a title alone never does. A department word in the title was **not** required: 21 of the 71 rows are placed by topics plus aims-and-scope text with no department term in the title, and 4 more by a society list. For Electrical versus Electronics the existing taxonomy is applied: the title picks; otherwise one scope lexicon must dominate by two to one; otherwise the journal is held. No journal counts for both.
* **Aims and scope were read from the journals' own sites** (robots.txt respected, 1 request per host per second). Of the 71, 37 carry site-confirmed scope (≥ 3 distinct department phrases and at least twice any competing department), and **21 of them would have been held under the earlier title-only rule** (topics plus site only). Generic phrases (*sensors, electronics, control systems, transformers, applied microbiology, cell culture, recombinant*) do not count as scope.
* General biology, microbiology, medicine, agriculture, chemistry, materials science and computer science are not placed without substantial relevant scope: an NLM subject alone is not Biotechnology evidence (it also files chemistry and sensor journals there: *ACS Sensors* was held for that reason); microbiology/biology titles without a biotechnology term, broad "science/engineering/technology" titles without a department term, computer-network titles (the existing taxonomy files them under Computer / IT), bioinformatics and multidisciplinary titles are held; condensed-matter physics (*Journal of Superconductivity*) and a vibration-engineering journal were held by hand with recorded reasons (`hand-holds.json`).
* Magazines, newsletters, proceedings, series, standards, technical reviews and trade serials are excluded by title (227 held); Crossref `journal-article` type alone was not treated as proof of a scholarly journal; sites that state cessation are held (9).
* **Publication evidence by lineage.** OpenAlex repeats Crossref's DOIs, so the two are not independent. A journal needs **direct** Crossref deposits (≥ 3 works in 2024–26, works in ≥ 2 of the 3 years, ≥ 1 in 2025–26): 68 of the 71 do. The other 3 rest on OpenAlex counts **plus an independent corroboration** (PubMed, J-STAGE's own latest-publication date, a 2025/2026 volume or issue on the journal's own site, or a DOAJ listing). 32 of the 71 carry at least one independent corroboration. A failed request or a missing external record was never treated as inactivity; it simply gave no evidence.
* No rename, predecessor or successor of a catalogue journal: NLM "continues / continued by" links and near-identical titles (token Jaccard ≥ 0.8, or ≥ 0.6 with the same publisher) against the whole catalogue were checked for every candidate; 14 were held.

## Why the supply is this small, and what would add more

Of 49,739 net-new journals, **47,202 are out of scope** (the OpenAlex pools are deliberately wide: they include every source with one topic in a neighbouring subfield, and the J-STAGE, SciELO and NLM lists are not subject-specific). **2,459 had some department evidence and were held** (reconciled below), **78 were eligible**, of which 7 were held by hand and **71 inserted** (47,202 + 2,459 + 78 = 49,739).

| Held, by first failed gate (unique journals) | Count |
|---|---|
| One kind of department evidence, and the journal's own site gave no usable aims-and-scope confirmation (site unreachable, no homepage, robots-disallowed, or too little text) | 1,282 |
| Broad engineering / science title with no department term, supported only by topics and a website | 353 |
| Reads as a magazine, newsletter, proceedings, series, standard, technical review or other non-journal | 227 |
| Publication evidence not enough (P-B: some recent works, not enough or no continuity) | 183 |
| Non-Latin title | 100 |
| Publication evidence none found (P-C; not treated as proof of inactivity, but there is nothing to rest an insertion on) | 79 |
| Multidisciplinary, bioinformatics/biostatistics, medical microbiology titles | 50 |
| Computer-network / networking title (Computer / IT in the existing taxonomy) | 42 |
| General biology / microbiology title without a biotechnology term | 40 |
| Journal classifier names another department (Nano Technology 28, Energy 20, Material Science 1, Management 1) | 50 |
| Near-identical title already in the catalogue, or a rename/continuation | 14 |
| The journal's own site states publication has ceased | 9 |
| No publisher in the listing, Crossref or OpenAlex (matching title) | 9 |
| Records sharing an ISSN carry different titles (identity unconfirmed) | 8 |
| An identifier fails the ISSN check digit | 8 |
| Evidence for several departments, none with two kinds / two equal | 5 |
| Eligible but held by hand at freeze | 7 |
| **Held in scope, total** | **2,466** (2,459 + 7) |

The largest block, 1,282, is **unresolved rather than invalid**: 579 journal sites did not answer, 506 candidates have no homepage in any source, 88 sites disallow automated access. Their scope could be confirmed by a person, by a licensed catalogue export, or by publisher cooperation, not by this run. The first run of this day already inserted the Electrical, Electronics and Bio Technology journals that the IEEE/ASME deposit lists, NLM subjects and OpenAlex topics could place with certainty; what remains is, with the sources reachable by program, mostly journals whose scope cannot be confirmed by two independent kinds of evidence. The 84 journals whose evidence points to one of these departments but which are **already in the catalogue under another department** (45 Energy → Electrical, 7 Electrical → Electronics, …) are review candidates, not additions: `review-other-department.json`.

## Canary and final verification

Dry run on live production first: 25 would insert, 0 held, 0 clashes. **Canary: 25 inserted, 0 skipped, 0 failed**, stratified by department and source (Bio 8, Electrical 8, Electronics 9; OpenAlex, Crossref and NLM rows). Read-only checks: all fields correct (MetadataOnly, openAccess false, no licence, publisher present, department and title equal the plan), **0 duplicate ISSNs, 0 cross-field collisions, 0 same-title rows, 0 articles attached, 25/25 public detail pages** correct, a dry re-run skips all 25, and the content hash of all 54,807 existing rows is unchanged.

**One verification did fail at the canary and writes were halted:** the production audit row of the canary batch could not be written (Postgres 22P05: a NUL character in one evidence snippet) although the 25 journals had been inserted correctly. The cause was fixed at the source (control characters are stripped when a manifest is built and when site text is read), the frozen manifest and plans were re-saved with only that snippet changed (the checksums before and after are in `resave-note.json`; no journal field differs), the missing audit row was written by a create-only script that reads the IDs back from the database by ISSN and refuses to run if a row already exists (`audit-backfill-canary.json`), and verification was repeated: the audit IDs equal the written IDs. Only then was the remainder written: **46 inserted in one batch, 0 skipped, 0 failed**, audit written normally, repeated live collision check clean, same verification clean.

Final: 71 of 71 present, 0 field problems, 0 collisions, 0 articles, **71/71 public pages**, existing rows unchanged (54,807), audit entries 25 + 46 = 71 matching the written IDs, ISSNs and departments.

## Audit, evidence and rollback

* **Run id** `dept-coverage2-2026-10-29-a8f54e56`; production audit: `IngestionAudit`, action `JOURNAL_SOURCE_IMPORT`, `meta.runId` = the run id, 2 entries (25, 46); the first was written by the backfill script (see above).
* `manifest-frozen.json` (71 rows, sorted compact JSON) with its checksum in `SHA256SUMS` and `audit-manifest.json` was saved before the first write. Every row carries its sources with URLs, the kinds of department evidence and their detail, the aims-and-scope pages read (URL, status, time, sha256), publication counts and corroboration, the rename-check result and the verification date. `audit-manifest.json` also has the exact inserted IDs, the sha256 of every code file used, and the before/after production numbers.
* **Rollback (reviewed, NOT executed):** `DELETE FROM "Journal" j WHERE j.id = ANY(<71 ids>) AND NOT EXISTS (SELECT 1 FROM "Article" a WHERE a."journalId" = j.id)`. The only foreign key is `Article.journalId ON DELETE SET NULL`, so the `NOT EXISTS` guard is essential. Today articles, ingestion runs and library events referencing the 71 are all 0. The `rightsBasis` label is not a safe scope (shared with thousands of other rows). Audit rows have no foreign key and are never deleted (`rollback-review.json`).

## Tests

New: `test-dept-coverage2-manifest.ts` 13/13 (offline invariants of the frozen manifest: ≥ 2 kinds of evidence per row, publication lineage, site pages recorded, no licence claims, no repeated identifier or title). Extended: `test-official-list-department.ts` 26/26 (IEEJ, KIEE, Optica, KSBB, JSBBA bodies and the biotechnology title terms). Unchanged and passing: `test-title-topic-department` 14/14, `test-journal-source-import` 39/39, `test-nlm-journals` 15/15, `test-openalex-journals` 60/60, `test-journal-quality` 52/52. The writer `journal-source-apply.cjs` was not changed.
