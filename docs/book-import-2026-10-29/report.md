# Book import, run `book-source-2026-10-29-f3a1c7e2` (DOAB + OAPEN, 2026-10-29)

Status: **9,493 books inserted and public (link-only records). A post-import verification found about 155 probable duplicates; nothing was deleted or changed, and rollback is prepared, not run.** See “Verification result”.

## What “added” meant in the staging logs
The harvest logs say *added* / *review*. Those are rows written to the **scratch** database `stm_books_stage` (Published = strong department + the harvest's own rules; Draft = review band). They are not production rows and not publication eligibility. Eligibility was decided afterwards by `scripts/books-freeze.ts`.

## Source coverage and reconciliation (unique counts)

| Step | DOAB | OAPEN | OpenStax | Total |
|---|---:|---:|---:|---:|
| Records retrieved (OAI / API) | 72,705 | 51,187 | 84 live | 123,976 |
| Unique after in-feed dedupe (chapters, deleted, repeats removed) | 60,717 | 44,526 | 84 | 105,327 |
| Already in production (any status) or in the legacy collection | 23,275 | 12,166 | 52 | 35,493 |
| **New to production** | 37,442 | 32,360 | 32 | 69,834 |
| …no department evidence at all (not staged) | 14,920 | 6,312 | 19 | 21,251 |
| Staged as Published by the harvest | 7,027 | 12,034 | 0 | 19,061 |
| Staged as Draft = **review candidates** (not inserted) | 15,577 | 14,014 | 13 (judged, not staged) | 29,591 (+13) |
| **Eligible after every check (frozen)** | 3,237 | 6,260 | 0 | **9,497** |
| **Inserted into production** | 3,233 | 6,260 | 0 | **9,493** |

(DOAB/OAPEN counts from the run logs; OpenStax: 84 live, 52 already held, 32 new = 13 English review-band, 8 English with no department evidence, 11 Spanish; none strong. 4 DOAB books were skipped by the live title check before writing.)

## Why 39,155 staged books were held (first reason)

| Reason | Books |
|---|---:|
| no department could be assigned (review band) | 27,855 |
| not English (German 3,403, Spanish 1,074, Portuguese 488, French 399, …) | 6,394 |
| no recognised licence with a recorded source | 2,811 |
| year before the policy (2001) or missing | 1,736 |
| already held as a legacy-collection title+author | 134 |
| duplicate of another book in this set (DOAB/OAPEN mirror) | 117 |
| serial issue / proceedings / working-paper series | 91 |
| same title+author+year held as a published manifestation | 16 |
| ISBN already held | 1 |

Rules applied (`scripts/books-freeze.ts`): the application's own publication gate (standing, metadata, year policy, recognised licence with a recorded source, access derived from the licence, no file address); department band must be *strong*; English only; valid ISBN-13 or DOI or the source's own handle; not a chapter/part; not a serial; not already held in any production status or the legacy collection; not a duplicate inside the set. Nothing is hosted or readable from here: every inserted book is `LinkOnly`, `rightsStatus MetadataOnly`, no file address. Source membership and licence text grant no hosting right.

## Production before / after (one snapshot each)

| | before 2026-10-29T06:55Z | after 2026-10-29T09:02Z |
|---|---:|---:|
| Book rows (New) | 102,190 | 111,683 |
| Book Published | 65,582 | 75,075 |
| Book Draft | 36,608 | 36,608 |
| Legacy Books listed | 29,344 | 29,344 |
| **Public books figure** | **94,926** | **104,419** |
| Draft / review insertions | | **0** |
| Public additions | | **9,493** |

## Department mix (public New collection)

| Department | Before | After | Added |
|---|---:|---:|---:|
| Nursing | 14,777 | 14,779 | +2 |
| Medical Sciences | 13,870 | 13,916 | +46 |
| Law | 8,505 | 8,598 | +93 |
| Agriculture | 7,758 | 7,779 | +21 |
| Arts | 874 | 5,258 | +4,384 |
| Energy | 5,138 | 5,138 | +0 |
| Computer / IT | 4,888 | 4,939 | +51 |
| Education and Social Sciences | 1,217 | 4,462 | +3,245 |
| Life Sciences | 1,589 | 2,195 | +606 |
| Pharmacy | 2,061 | 2,061 | +0 |
| Dental | 1,478 | 1,478 | +0 |
| Bio Technology | 970 | 973 | +3 |
| Chemistry | 893 | 939 | +46 |
| Commerce | 432 | 814 | +382 |
| Science | 428 | 568 | +140 |
| Management | 173 | 461 | +288 |
| Architecture | 191 | 372 | +181 |
| Physiotherapy | 173 | 173 | +0 |
| Civil / Construction Engineering | 45 | 49 | +4 |
| Electronics & Telecommunication Engineering | 45 | 45 | +0 |
| Mechanical Engineering | 42 | 42 | +0 |
| Electrical Engineering | 21 | 22 | +1 |
| Material Science | 9 | 9 | +0 |
| Chemical Engineering | 3 | 3 | +0 |
| Applied Mechanics | 2 | 2 | +0 |

Growth is almost entirely Arts and Education & Social Sciences, as the dry-run predicted: DOAB/OAPEN barely contain engineering titles. Engineering departments grew by 5 books in total; they need other sources.

## Verification result (honest)
- Canary 25, then 475, then 90 batches of ≤100: no failures, no live collisions, exact ids persisted per batch (`committed-batches.ndjson`), 96 audit entries `BOOK_SOURCE_IMPORT`, every id in exactly one entry.
- Checks passed: fields = manifest, status Published, departments as frozen, licence, no file address, not viewable-here, rights MetadataOnly, landing page present; the first 25 also answer 200 on the live public API as link-only.
- **Check failed:** the read-only duplicate check flagged 3 books; a looser follow-up (`twins-extended`) found **155 probable duplicate pairs**: 144 imported books that match an older row (140 in the legacy collection, 4 in `Book`) and 11 pairs where both rows are in this import (DOAB and OAPEN copies with different or missing ISBNs). Cause: my freeze-time author key compared “Nico Cloete, Peter Maassen” with “Cloete, Nico, Maassen, Peter” as different, so title+author twins slipped through. The 3 hand-checked cases are true duplicates. 9 weaker matches are false positives (non-Latin titles).
- The run had already finished when this was detected. **No further writes were made, nothing was deleted, unpublished or edited.** `duplicate-candidates.json` lists the exact ids; `rollback-guarded.json` has exact-id SQL with dependency guards (not executed). Dependency review: all 9,493 rows unchanged, 0 chapters / read events / library events depend on them.
- Existing production data was not modified. The engine's own dedupe key (`firstAuthorKey`) has the same weakness; not changed here (finding).

## Artefacts
manifest-frozen.json.gz (sha256 in manifest-frozen.sha256 = 8c48ef435dce1a93b55643c5fd32ba78c4d6227cfdcef29c8569075fcc5e6610), evidence.json.gz, held.json.gz, report.json, inserted-ids.json, committed-batches.ndjson, audit-manifest.json, duplicate-candidates.json, rollback-guarded.json, reconcile-before/after.json. Raw harvest logs, the staging dump and the production identity export stay outside Git in `data/book-import-2026-10-29/`.
