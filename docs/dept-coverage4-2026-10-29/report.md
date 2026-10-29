# Bio Technology, Electrical Engineering, Electronics & Telecommunication: official-export round (run `dept-coverage4-2026-10-29-9a31ea75`)

## Senior-management update

**Confirmed:** 18 more journals were added to the public catalogue (Electrical Engineering +15, Electronics & Telecommunication +3). They are listed with metadata only: no articles, no licence and no full-text rights are claimed. The three departments now hold 778 (Bio Technology), 570 (Electrical) and 510 (Electronics & Telecom) journals; across the three expansion runs 93 of the 2,000 allowed additions were used and **1,907 remain unused**, because the evidence rules were not relaxed. Springer Nature's official public title lists were reached automatically and cross-checked; Wiley and IET block automated access and need a person to download one file each (steps in `manual-exports.md`).

**Possible future supply (not counted):** (1) the Wiley and IET official lists once downloaded; (2) about 1,450 journals that have exactly one kind of department evidence and whose own website cannot be read automatically (a person confirming their scope, or a licensed catalogue export, could release some); (3) further non-English title vocabularies (this round added German, Indonesian, Spanish and Portuguese terms, which alone unlocked 17 journals). None of this is guaranteed to yield additions, and this report does not claim any source is exhausted worldwide.

## Result

| Department | Total before → after | Public before → after | Public with a published article | NeedsReview | Inserted |
|---|---|---|---|---|---|
| Bio Technology | 778 → 778 | 443 → 443 | 272 → 272 | 335 → 335 | 0 |
| Electrical Engineering | 555 → 570 | 340 → 355 | 153 → 153 | 215 → 215 | 15 |
| Electronics & Telecommunication | 507 → 510 | 215 → 218 | 51 → 51 | 292 → 292 | 3 |
| **All journals** | **54,882 → 54,900** | MetadataOnly 16,435 → 16,453 | Accepted 12,840 unchanged | 25,607 unchanged | **18** |

Baseline re-measured from production at 07:19 UTC. **Cumulative count verified first:** the 75 journals of the two earlier runs are all present in production (75 of 75 rows, 0 field problems, 0 collisions, 0 articles). 75 + 18 = **93 of 2,000; 1,907 remain** (a ceiling, not a quota). All 18 are `MetadataOnly`, `openAccess = false`, no licence or rights, labelled by source (OpenAlex 17, "Springer Nature KBART" 1); existing records, classifications and rights are unchanged.

## 1. Reporting gaps closed

* **The two-record difference** (previous run's net-new 49,739 vs 49,666 in the next pool): 73 = the 71 journals the previous run inserted + 2. The two are OpenAlex source records called *BiotechIntellect* under other ISSNs (2091-1319, 3115-7920); once the journal (ISSN 2410-8308) was in the catalogue they became title conflicts (title conflicts 1,172 → 1,174), held and never merged. 49,739 − 71 − 2 = 49,666. They may be the same journal under older or newer ISSNs; that needs a person (kept as unresolved identity).
* **Confirmed exclusions vs unresolved holds** (this round's held records, 2,700 incl. 17 held by hand; previous round in `reconciliation.json`): *A, confirmed non-journal serials, ceased titles, invalid ISSN:* **270**. *B, scope or policy exclusion by rule (department not supported by the title/topics, computer-network, general-biology, multidisciplinary or broad titles, another department named, non-Latin title):* **650**. *C, unresolved identity (title conflict, rename, shared ISSN, no publisher):* **36**. *D, held by hand, scope or type not confirmed:* **17**. *E, unresolved publication evidence (some or no recent works found; not proof of inactivity):* **281**. *F, one kind of department evidence and no scope page that could be read:* **1,446**. Net-new journals: 50,407 = 47,689 out of scope + 2,683 held + 35 eligible; the 35 eligible = 18 inserted + 17 held by hand.
* **Bounded retries, transactional audit, rollback dependency checks:** `test-journal-apply-transactional.ts` now has 22 cases in the isolated database: a conflict at *every* attempt ends after exactly 3 attempts with exit 5, no journal of the batch and no audit row; an audit failure rolls the batch back and a retry inserts each journal once; the exact-id rollback statement deletes only the journal without articles, never one that has an article (the FK is `ON DELETE SET NULL`, so the `NOT EXISTS` guard is what protects it), and re-running it is a no-op.

## 2. The official routes

| Route | Public interface and terms | Result |
|---|---|---|
| Springer Nature KBART (`metadata.springernature.com/kbart`) | Direct public `.txt` files; the support article states the lists are public "to understand which titles are included in our collections" and "update discovery services, catalogues, link resolvers". Used as discovery/identity only. | **Complete**: complete journals (3,574 rows), BioMed Central (442), Nature (231 + 70), and the industry-sector lists Biotechnology (408), Electronics (422), Telecommunications (295), Engineering (311), Energy (363). Springer journal pages (`title_url`) were read for aims and scope (robots.txt allowed; all 201 pages requested for previously unreadable candidates answered). |
| Wiley KBART (`…/kbart2019`) | Cloudflare challenge (HTTP 403, "enable JavaScript and cookies") | **Blocked**, not bypassed. Manual steps and the exact file name the pipeline reads: `manual-exports.md` (the parser is in place and self-tested). |
| IET journal portfolio | Imperva challenge page, no content; `digital-library.theiet.org` HTTP 403 | **Blocked**, not bypassed. Manual steps in `manual-exports.md`. IET is already represented by its own Crossref deposits (51 journals). |

**Coverage of the Springer lists against the catalogue** (distinct journals; identifiers matched against every status and department): complete journals 3,570 → 1,913 already held, 19 title conflicts, 1,638 net-new; sector lists Biotechnology 408 (226 held, 182 net-new), Electronics 421 (286 held, 134 net-new), Telecommunications 295 (210 held, 85 net-new). Of the 1,270 single-evidence journals of the previous round, 37 appear in the Springer lists (15 in a sector list), so one source could not resolve the bulk of that group.

**What the Springer sector lists turned out to be:** the publisher's commercial groupings, not a subject classification (the Biotechnology list includes *Archives of Pharmacal Research* and *Sports Medicine*). They were therefore accepted only as one catalogue kind of evidence together with another kind. Of 308 net-new journals in the three sector lists: 196 stay at one kind of evidence, 67 have no department evidence by any rule, 24 are magazine/report titles, 12 are general biology titles, 6 reached eligibility and **1 was inserted** (*e+i Elektrotechnik und Informationstechnik*, title + Springer Electronics list + current Crossref deposits). Held by hand with reasons (`hand-holds.json`): *Food and Bioprocess Technology* (food science), *Waste and Biomass Valorization* (environmental), *Science China Information Sciences* (information sciences), *Nature Sensors* (cross-disciplinary sensing), *ATZelektronik* and *Elektronika: konstrukcje…* (trade magazines), and a title naming both electrical and mechanical engineering.

## 3. Where the 18 came from

17 of the 18 come from the previous round's single-evidence group and were released by a **documented coverage gap**, not by Springer: department terms in non-English titles were missing (*Teknik Elektro*, *Elektrotechnik*, *Ingeniería/Engenharia Eléctrica*, *Elektronika*, *Telekomunikasi*, *Biotecnología*, *Biotechnologie*). With the vocabulary added (tests: `test-title-topic-department.ts` 16/16) these journals have a title term plus OpenAlex topics that put the department first, current Crossref deposits (all 18 are *direct* publication evidence), a publisher, and no rename or title conflict. Only one is a Springer journal. The rule set is otherwise unchanged: two different kinds of agreeing evidence, publication evidence by lineage (OpenAlex repeating Crossref is not independent), global de-duplication against every status and department, no non-journal serials, no unresolved title conflicts. The 84 journals sitting in another department remain preview-only (`review-other-department.json`).

## Verification

Dry run on live production: 18 would insert, 0 held; live collision check: 0. One transaction (journals + audit row, attempt 1, 0 rejected, 0 sanitised rows). Checks: 18/18 present; 0 field problems; 0 duplicate or cross-field identifiers; 0 same-title rows; 0 articles; **18/18 public detail pages**; a dry re-run skips all 18; the hash of all 54,882 existing rows is unchanged; the audit row lists exactly the 18 ids, ISSNs and departments.

## Audit, evidence, rollback

Run id `dept-coverage4-2026-10-29-9a31ea75`; `IngestionAudit` action `JOURNAL_SOURCE_IMPORT`, `meta.runId` = the run id, 1 entry (18). The frozen manifest and its checksum (`SHA256SUMS`, `audit-manifest.json` with the code hashes) were saved before the write. **Rollback (reviewed, NOT executed):** `DELETE FROM "Journal" j WHERE j.id = ANY(<18 ids>) AND NOT EXISTS (SELECT 1 FROM "Article" a WHERE a."journalId" = j.id)`; articles, ingestion runs and library events referencing the 18 are all 0 (`rollback-review.json`). The new label "Springer Nature KBART listing — OA unverified" is unique to this run's one Springer row; the OpenAlex label is shared and is not a rollback scope.

## Tests

`test-journal-apply-transactional.ts` 22/22, `test-title-topic-department.ts` 16/16, `test-dept-coverage2-manifest.ts` 13/13 on this manifest, `test-official-list-department.ts` 26/26, `test-journal-source-import.ts` 39/39, `test-nlm-journals.ts` 15/15, `test-openalex-journals.ts` 60/60, `test-journal-quality.ts` 52/52.
