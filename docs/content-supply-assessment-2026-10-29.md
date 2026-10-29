# Additional content supply — assessment (2026-10-29)

Scope: books (continued from the book-import work) and a preview-only look at the other content types. **Nothing was imported, frozen, published or changed**; no import was started. Department-page improvements are not evidence of new content and are not counted here.

Sources of the figures: production read-only counts at 2026-10-29T08:37Z (`Book` by source, `BookHarvestCheckpoint`, `IngestionSourceHealth`); the staged harvest of DOAB and OAPEN in the scratch database `stm_books_stage` (harvest logs and the production identity export of 06:59Z belong to the Books session: `scripts/books-stage-harvest.ts`, `scripts/books-freeze.ts`); and a **report-mode run of `scripts/books-freeze.ts`** (counts only, writes nothing) at ~09:10Z, which judges each staged record against every production identity with the application's own publication gate, department evidence, rights, identity, language, whole-book and duplicate checks. The identity export is about two hours older than the production counts, so a few books added since could move a record from "net-new" to "already held".

## A. Books, by source

"Retrieved" = records the source delivered. "Held" = already in production (any status). "Eligible net-new" = passes **every** gate (frozen-manifest rules), not merely "not a duplicate".

| Source | Coverage | Retrieved / in production | Existing duplicates | Eligible net-new | What is missing for the rest |
|---|---|---|---|---|---|
| **DOAB** | Production harvest **blocked** (ECONNRESET, 346 consecutive failures, never succeeded from the server; retry paused to 12:30Z). Staged from a dev machine: **complete** (728 pages, 72,705 fetched, 60,717 unique, 0 failed) | 35,395 held (all Published, all link-only); staged candidates not already held: 22,604 | by DOI 21,912, ISBN 146, fingerprint 1,118, title 82, inside the run 201 | **3,254** | see "Held, all staged records" below |
| **OAPEN** | Production harvest **blocked** (130 consecutive failures; 0 books held from it). Staged: **partial** — no completion line; last log at page 377 / offset 37,700; still growing (17,913 → 19,348 candidates during this task) | 0 held; staged candidates: 19,348 | by DOI 7,489, ISBN 694, title 928, in-run 249 (as of the last log line) | **4,752 so far** (will rise as the harvest finishes) | same |
| NLM Catalog | Running, healthy; **partial** (cursor `0|5400`), total supply not measured | 54,043 held (24,352 public; 29,691 Draft, 29,591 of them with no department) | n/a | not established | department (a controlled code exists but 29.6k are unplaced); no licence (metadata-only by design) |
| Open Library (data dump) | Bulk-only, resumable; **partial**, dump size not measured | 6,574 held (4,099 public, 2,475 Draft) | n/a | not established | no licence, no department for 2,475 |
| Open Library (search) | Targeted runs; partial | 2,011 held (8 public, 2,003 Draft) | n/a | not established | no licence, department review-first |
| Open Textbook Library | Healthy, last success 10-26; **likely near complete**, not measured | 1,892 held (1,532 public, 360 Draft) | n/a | not established (≈0 expected) | 16 metadata-only; 360 held for review |
| NCBI Bookshelf | Running (cursor 938); partial | 720 held (184 public, 536 Draft) | n/a | not established | department confidence (no controlled code); 306 metadata-only |
| Crossref Books | **Never completed** a sync; partial; off in rotation | 1,170 held, all Draft | n/a | not established | no licence on any, no controlled department code, 0 public |
| Pressbooks | Cursor at page 31; partial | 385 held (12 public) | n/a | not established | no year on any of 385; licence on 31; per-site rights |
| **OpenStax** (not in the rotation) | Catalogue fetched once (129 entries); not validated | 84 "live" titles (80 CC BY-NC-SA, 38 CC BY across all entries, 11 with no licence) | 33 already held by title (Open Textbook Library) | **not established**: ≈51 by title only, before ISBN/edition checks, licence evidence (many are NC-SA) and department | per-title licence evidence, ISBN identity, edition handling, department |
| Library of Congress | **Blocked** (Cloudflare 403 from our host) | — | — | not established | access |
| Project Gutenberg | Not built (public domain; Arts/Humanities only) | — | — | not established | provider, rights basis |

### The staged DOAB + OAPEN set (the only established supply)

Report-mode result against 151,174 production book identities (102,190 `Book` + 48,984 legacy):
* Discovered and not already held at harvest: **41,952** (DOAB 22,604; OAPEN 19,348, still growing).
* **Eligible under every gate: 8,006** (DOAB 3,254; OAPEN 4,752). All English; all with a recognised open licence (CC BY-NC-ND 4,347 · CC BY 2,296 · CC BY-NC 867 · CC BY-NC-SA 265 · CC BY-SA 183 · CC BY-ND 48); all metadata-only (no file hosted, not viewable here — an open licence at the source grants us no hosting right).
* By department (strong evidence only): Arts 3,615 · Education and Social Sciences 2,711 · Life Sciences 580 · Commerce 338 · Management 246 · Architecture 160 · Science 128 · Law 75 · Chemistry 46 · Computer / IT 42 · Medical Sciences 39 · Agriculture 18 · all others ≤ 3. **It is a humanities and social-science supply; it does not close STEM or health gaps.**
* **Held: 33,946**, for each record's first failing reason: no department 24,427; licence not verifiable 2,434; year policy (2001+) 1,569; already held after independent matching 349 (106 by title + author against the legacy collection); duplicate of another staged record 76; not a whole book (chapter/part by title) 5; and non-English (German 2,546, Spanish 1,044, Portuguese 484, French 350, Italian 279 …; 19,313 records in all by any reason) — the product is English-only and the classifier reads English wording. Combined figures for the two sources; the tool reports reasons across both.
* Books vs chapters/articles/proceedings: the gate separates chapters only by title pattern ("Chapter 3", "Part II"); only 5 were caught. Whether DOAB/OAPEN chapter-level records are all excluded by that pattern is **not verified**; a sample should be read before any freeze.
* Status of the set: **staged only**. It has not been frozen into a manifest, reviewed, approved or applied, and the OAPEN part is incomplete.

## B. Other content types — source and eligibility preview only

No source was fetched for this section and no journal rule was applied to anything but journals. Production today: Magazines 5,962, Case Reports 1,997, Theses 45,027, Conference Proceedings 5,982, Educational Videos 1,105, Newsletters 1,989 (all Archived; the New collection is empty for all six).

| Type | Existing workflow | Candidate sources (not probed) | What eligibility needs — and is missing today |
|---|---|---|---|
| Magazines | none | open-access magazine publishers | an explicit reuse licence per issue or title; no pipeline; **supply not verified** |
| Case Reports | the article pipeline can carry the type | Europe PMC / PMC open subset case reports; open case-report journals | per-article licence (not the journal's), patient-privacy check, a "case report" type decision; **not verified** |
| Theses | none (legacy imports) | institutional repositories (OAI-PMH), national ETD portals | per-thesis licence and author permission, institution terms; first resolve the 846 theses whose status is "Open Access"; **not verified** |
| Conference Proceedings | article pipeline (types not separated) | arXiv, OpenAlex proceedings-article records, Zenodo | proceedings-vs-journal separation, per-paper licence; **not verified** |
| Educational Videos | none | open course video collections | video licence, embedding vs hosting terms, platform terms; **not verified** |
| Newsletters | none | institutional newsletters | permission from the issuer; **not verified** |

## C. Short message for senior management

> Additional supply is not yet verified. For books, a trial (non-production) read of two open book catalogues, DOAB and OAPEN, found 8,006 English, openly licensed books that are not in the library and pass our publication checks. They are catalogue records that link to the publisher, they are mostly Arts and Social Sciences rather than science or health, one of the two catalogues is still being read, and none has been reviewed or imported yet. For magazines, case reports, theses, conference proceedings, videos and newsletters, additional supply is not yet verified; that does not mean no more material exists, only that it has not been checked.

## D. Blockers

* The production server cannot reach DOAB or OAPEN (connection reset for weeks); the staged harvest ran from a dev machine. Importing needs the freeze → review → transactional apply path the Books session built, with approval.
* OAPEN staging must finish before its figure is final; the identity export should be refreshed immediately before any freeze.
* 24,427 staged records are held only because no strong department evidence exists; adding evidence (not loosening the threshold) is the route to more eligible books.
