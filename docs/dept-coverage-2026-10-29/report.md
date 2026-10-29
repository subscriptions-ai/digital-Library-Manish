# Department journal coverage: 231 new journals inserted (run `dept-coverage-2026-10-29-caca7d79`)

Authorization: fetching, validation and controlled production insertion of **eligible net-new** journals for Electrical Engineering, Electronics & Telecommunication, Mechanical Engineering, Applied Mechanics, Pharmacy, Bio Technology, Chemical Engineering, Nano Technology, Architecture, Physiotherapy and Ayurveda. Existing-record status transitions, article/full-text ingestion, schema changes and deployments were out of scope and were not done. No existing journal was modified or reclassified, and the generic "Engineering" department (9 journals) was not touched and not used as a fallback.

The attached screenshot was not visible to this session; the department list was taken from the written brief. No screenshot count was used as a fact: every figure below was re-measured from production on 2026-10-29.

## Result

| Department | Total before → after | Public before → after | Public with a published article before → after | Inserted |
|---|---|---|---|---|
| Electrical Engineering | 522 → 539 | 307 → 324 | 153 → 153 | 17 |
| Electronics & Telecommunication | 422 → 462 | 130 → 170 | 51 → 51 | 40 |
| Mechanical Engineering | 652 → 705 | 431 → 484 | 100 → 100 | 53 |
| Applied Mechanics | 294 → 297 | 81 → 84 | 3 → 3 | 3 |
| Pharmacy | 595 → 665 | 295 → 365 | 136 → 136 | 70 |
| Bio Technology | 754 → 764 | 419 → 429 | 272 → 272 | 10 |
| Chemical Engineering | 238 → 239 | 104 → 105 | 66 → 66 | 1 |
| Nano Technology | 290 → 303 | 152 → 165 | 66 → 66 | 13 |
| Architecture | 357 → 359 | 154 → 156 | 68 → 68 | 2 |
| Physiotherapy | 388 → 392 | 314 → 318 | 25 → 25 | 4 |
| Ayurveda | 369 → 387 | 257 → 275 | 44 → 44 | 18 |
| Engineering (generic, untouched) | 9 → 9 | 9 → 9 | 9 → 9 | 0 |
| **All journals** | **54,576 → 54,807** | MetadataOnly 16,129 → 16,360 | Accepted 12,840 unchanged | **231** |

"Public" is the product's rule (status Accepted or MetadataOnly). New journals have no articles, so "public with a published article" cannot move. None of the 231 is Accepted; none claims a licence, open access or full-text rights.

## Source coverage and pilot yield

All sources, queries, pagination, retrieval times, counts and checksums of the raw files are in `coverage-ledger.json`. Raw files stay on disk under `data/dept-coverage/raw/` (git-ignored).

| Source | What was read | Distinct journals | Already held | Title conflict | Net-new | Inserted (listing it) |
|---|---|---|---|---|---|---|
| OpenAlex sources, 13 documented filters (`type:journal` + topic subfields / topic ids / title search) | 146,169 source records | 68,628 | 24,415 | 992 | 43,221 | 231 (all rows have an OpenAlex record; 165 rest on OpenAlex topics + a specific title term) |
| Crossref, publisher deposits: IEEE (member 263) | 493 ISSNs → 276 journals | 274 | 121 | 7 | 146 | 26 (24 placed by the society-list route) |
| Crossref: ASME (33) / IET (265) / JSME (124) / IEICE (532) | 31 / 51 / 39 / 8 journals | 30 / 51 / 39 / 8 | 16 / 47 / 21 / 6 | 1 / 1 / 0 / 0 | 13 / 3 / 18 / 2 | 6 / 0 / 0 / 0 (+1 journal of the Korean Society of Mechanical Engineers, recognised through the OpenAlex society field) |
| NLM Catalog by NLM Subject (10 subjects) | 4,929 serials | 2,900 | 828 | 41 | 2,031 | 35 first-listed (36 list it) |
| DOAJ CSV | 23,554 rows | 23,520 | 23,496 | 21 | 3 | 0 |
| IEEE Xplore title browse, IEEE Publishing Portal | JavaScript application, no title list in the HTML (first probe HTTP 418) | | | | | **blocked, not bypassed** |
| IET Digital Library, SAGE (IMechE), AIChE, ScienceDirect, EurekaSelect | HTTP 403 to non-browser clients | | | | | **blocked, not bypassed** |
| ASME site, JSME site | timed out | | | | | not reachable; their journals were taken from Crossref deposits |

The IEEE and ASME journal lists could therefore not be read from the societies' own title pages; they are the societies' **own Crossref deposits** (journal-article deposits since 2024), which exclude magazines and proceedings by type. Crossref `/journals` returns no subjects, so IEEE/ASME titles still needed the title and topic checks below. A journal found by several sources counts once.

**Pilot yield (inserted journals):**

| Pilot | Departments | Inserted | Reliable? |
|---|---|---|---|
| A | Electrical 17, Electronics & Telecom 40 | **57** | 24 from IEEE's own deposits (clean evidence: society + title + topics); 33 from OpenAlex topics + title |
| B | Mechanical 53, Applied Mechanics 3 | **56** | 6 from ASME deposits, 1 KSME; 49 from OpenAlex topics + title (many Indonesian *Jurnal Teknik Mesin*) |
| C | Pharmacy 70, Bio Technology 10 | **80** | 17 Pharmacy + 10 Bio Technology from NLM subjects (with title evidence); 53 Pharmacy from OpenAlex topics + title |
| then | Ayurveda 18, Nano 13, Physiotherapy 4, Architecture 2, Chemical Engineering 1 | **38** | NLM subject with a title term (physio, architecture, chemical engineering, bio) or OpenAlex topics + title (ayurveda, nano) |

By evidence route: society/publisher list + title + topics 31, NLM subject + a title term 35, OpenAlex topics + a specific title term 165. **Reliable additions with the least unresolved evidence** came from the IEEE/ASME deposit lists (31 inserted; society + title + topics all agree; the IEEE journals that were held were held for a title conflict or thin topics, not for identity doubts) and from Pharmacy's OpenAlex + title route. **DOAJ produced nothing new** (3 net-new rows, none eligible). **Chemical Engineering, Architecture and Physiotherapy are supply-limited**: their open metadata mostly lacks a department-specific title term, so one-signal candidates were held rather than guessed.

## Funnel and reconciled hold totals

84,757 distinct journals were found (all pools merged by shared ISSN). 38,751 already exist in the catalogue by identifier (ISSN, e-ISSN or ISSN-L, in either column, any status, including NeedsReview and earlier imports) and 1,037 share a normalised title with a held journal under other identifiers (held, never merged). That leaves **44,969 net-new**. Each is counted **once**, by its first failed gate:

| Outcome (unique journals) | Count |
|---|---|
| Out of scope: no evidence route names one of the 11 departments (the topic-subfield pools are deliberately wide: 35,336 electrical-subfield sources, 38,533 mechanical, …) | 38,855 |
| Held: department evidence below the bar (topics under half, or a title term with topics under a quarter or not leading) | 4,181 |
| Held: catalogue subject (NLM/DOAJ) with no department term in the title and topics under 25% | 938 |
| Held: topic evidence only (a single kind of evidence) | 456 |
| Held: fewer than 3 works in 2024–26 or none in 2025–26 in OpenAlex/Crossref counts | 197 |
| Held: reads as a magazine, newsletter, proceedings, series or directory | 25 |
| Held at stage 2: near-identical title already in the catalogue (possible rename, edition or same-title conflict) | 21 |
| Held at stage 2: no publisher in the listing, Crossref or OpenAlex (matching title) | 20 |
| Held at stage 2: publication evidence not enough (P-B: no continuity across years) | 12 |
| Held: records sharing an ISSN carry different titles (identity unconfirmed) | 8 |
| Held: non-Latin title | 8 |
| Held: journal classifier says another department (Energy 5, Management 1) | 6 |
| Held at stage 2: NLM "Continues / Continued by" relation to a catalogue journal | 3 |
| Held: physiotherapy title does not name the field (rehabilitation is not physiotherapy) | 2 |
| Held: an identifier fails the ISSN check digit | 2 |
| Eligible at the end of validation | 235 |
| Held by hand at freeze (PhotonicsViews magazine; *maschinenbau* trade magazine; *The Pharmaceutical Journal* professional news magazine; *Panorama actual del medicamento* bulletin; reasons in `hand-holds.json`) | 4 |
| **Inserted** | **231** |

Check: 38,855 + 5,879 held + 235 eligible = 44,969; 235 − 4 hand holds = 231. In-scope held records by department are in `held.json` (5,883 records with reason); `reconciliation.json` has the machine-readable totals per department.

## What a journal had to pass (all of it)

* A valid ISSN check digit on every identifier, no identifier held in any catalogue row (cross-field), no same normalised title, no near-identical title (token Jaccard ≥ 0.8, or ≥ 0.6 with the same publisher) and no NLM "continues / continued by" link to a catalogue journal.
* A publisher, taken from the listing or, when the listing had none, from Crossref/OpenAlex **only when the returned journal title matched** (102 of the 231; recorded per row as `publisherFill`).
* A Latin-script title that does not read as a magazine, newsletter, proceedings, series, directory or trade serial.
* **At least two different kinds of department evidence that agree** (never one): a publisher/society list **plus** a specific title term **plus** topic support (new module `officialListDepartment.ts`); or a specific title term **plus** OpenAlex topics that put the department first (new `titleTopicDepartment.ts`); or an NLM subject with a department-specific title term or ≥ 25% topic support; or the earlier strict topic rule plus one of these. Topics alone, an NLM subject alone, or a title alone never place a journal. The department name did not have to be in the title: 133 of the 231 titles do not contain the department's English name (they use the field's own terms: *Teknik Mesin*, *Homoeopathic*, *Plasma Science*, *Vehicular Technology*, *Tissue Engineering* …).
* The named exclusions were applied as rules, not by hand: no "rehabilitation" → Physiotherapy, no "traditional medicine" → Ayurveda, no "chemistry" → Chemical Engineering, no "biology" → Bio Technology, no "engineering" → Electrical or Mechanical (each needs a specific term; `test-title-topic-department.ts` pins this).
* **Recent publication, not an arbitrary article count:** at least 3 works in 2024–26 in Crossref or OpenAlex (journal title must match), at least one in 2025–26, **and works in at least two of the three calendar years** (so a quarterly or an annual journal passes, a one-off burst does not).

Every inserted journal is `MetadataOnly`, `openAccess = false`, no licence, no rights verification, `rightsBasis = "<source> listing — OA unverified"` (OpenAlex 165, NLM Catalog 35, Crossref 31), never `Accepted`.

## Canary (25) and final verification

Dry run on live production first: 25 would insert, 0 held, 0 title clashes. Canary: **25 inserted, 0 skipped, 0 failed**, stratified across all 11 departments (≥ 1 each). Checks (read-only, `verify-canary*.json`):

* fields: 25/25 MetadataOnly, openAccess false, no licence/rights verification, publisher present, department and title equal the plan;
* **0 duplicate ISSNs, 0 cross-field collisions, 0 same-title rows, 0 articles attached**;
* **25/25 public detail pages** (`/api/library/journal/:issn`) return the right title, department and MetadataOnly;
* duplicate prevention: re-running the canary (dry) would insert 0 and skips 25 as identifier-held;
* preservation: the content hash of all 54,576 pre-existing rows is **identical before and after**.

The remaining 206 went in as batches of 100, 100 and 6, each preceded by a repeated live collision check against everything created since the catalogue snapshot and each followed by the same verification: **206 inserted, 0 skipped, 0 failed**. Final (`verify-final.json`, `verify-final-public.json`): 231/231 present, 0 field problems, 0 identifier collisions, 0 same-title rows, 0 articles, **231/231 public pages**, existing-rows hash unchanged, audit entries 25 + 100 + 100 + 6 = 231 and their ids equal the written ids (and the plan's ISSNs and departments).

A parallel session wrote 42 Nursing journals to production between my snapshot and my first write (total 54,534 → 54,576). They were detected by the pre-write count check, compared against the plan (0 collisions), and treated as existing records in the preservation hash.

## Audit, evidence and rollback

* **Run id** `dept-coverage-2026-10-29-caca7d79`. Production audit: `IngestionAudit`, action `JOURNAL_SOURCE_IMPORT`, `meta.runId` = the run id, **4 entries** (25, 100, 100, 6), each listing id, ISSN, department, source id and evidence.
* `manifest-frozen.json` (231 rows, sorted compact JSON) sha256 `1367102e830a9b6b82e3d88f1fe5226da0fcbd08234ed592f890dd12bb9d07c4`, saved with `SHA256SUMS` before the first write. Every row carries its sources with URLs, department route and evidence (topic shares, society body, title term), publication counts per source, rename-check result and verification date.
* `audit-manifest.json`: exact inserted ids (canary first), the checksums, the sha256 of every code file used, production before/after, verification results, and the rollback statement.
* **Rollback (reviewed, NOT executed):** `DELETE FROM "Journal" j WHERE j.id = ANY(<231 ids>) AND NOT EXISTS (SELECT 1 FROM "Article" a WHERE a."journalId" = j.id)`. The only foreign key is `Article.journalId ON DELETE SET NULL`, so the `NOT EXISTS` guard is essential. Today the articles, ingestion runs and library events referencing the 231 are all 0, so all 231 would be deleted; recount before any use. The `rightsBasis` label is **not** a safe scope (shared: OpenAlex 6,435 rows, Crossref 24,048, NLM 153). Audit rows have no foreign key and are never deleted (`rollback-review.json`).

## Findings outside this task (nothing changed)

* Some existing records sit in a department that does not fit their title, e.g. *Journal of Manufacturing Science and Engineering* and *Journal of Dynamic Systems, Measurement and Control* (ASME) are under Electrical Engineering, *Journal of Applied Mechanics* is also under Civil / Construction. Reclassifying is out of scope; the list can be produced from the snapshot.
* ASME *Journal of Applied Mechanics* (NeedsReview) and *Applied Mechanics Reviews* (NeedsReview) are held and were not re-created; their status transitions remain unauthorized.
* 5,879 in-scope near-misses are held. The largest block (4,181) has some department evidence but not enough; reading the journals' aims-and-scope pages is the lever, and most publishers refuse automated access.

## Tests

`test-official-list-department.ts` 23/23 (new), `test-title-topic-department.ts` 14/14 (new), `test-dept-coverage-manifest.ts` 16/16 (new; offline invariants of the frozen and audit manifests), and the existing suites that guard the writer and classifiers: `test-journal-source-import.ts` 39/39, `test-nlm-journals.ts` 15/15, `test-openalex-journals.ts` 60/60, `test-journal-quality.ts` 52/52. The writer script `journal-source-apply.cjs` and the planner/classifier modules it relies on were **not changed**; their hashes are in the audit manifest.
