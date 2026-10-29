# Bio Technology, Electrical Engineering, Electronics & Telecommunication: bounded evidence-review phase (round 7, zero additions)

Run id `dept-coverage7-2026-10-29-18eacf38` (no production write, so no production audit row). Previous round: commit `9e81c56`, run `dept-coverage6-2026-10-29-25715162`, shortlist of 105.

## Senior-management update

**No journals were added this round; no production write was made.** Production is unchanged at 54,902 journals; the **95** journals added in earlier rounds are all present and healthy; **1,905 of the 2,000 ceiling remain unused**.

What was done and what it showed:
- **Wiley export:** still blocked by a browser check (it also refuses the general fetch tool). A person must download one file; exact steps below. Nothing was bypassed.
- **105-candidate review (automated reader only; no person reviewed any evidence):** the missing official URL was found for 14 of 39 journals through an ISSN-matched record; for 105 candidates the outcomes are: 1 reached a second kind of evidence from the journal's own pages but is held because the **publisher of record conflicts** between Crossref and the journal's site; 47 official pages read without a clear department statement; 3 ambiguous between Electrical and Electronics; 25 sites did not answer; 4 disallow automated reading; 25 have no resolvable official URL.
- **Flagged journals:** retain-and-review recommendations prepared for the three, with the exact IDs and decision options; nothing was deleted or changed.
- **Evidence integrity:** the discarded page text still exists in two pushed commits on `origin/feat/email-due-users-overlap` and in three production audit rows; the scope is documented, history was not rewritten and audit rows were not edited.

**What would unlock more:** (1) the Wiley file (one manual download); (2) a person confirming scope and publisher at the official URL for the 105 shortlisted journals, starting with the one held on publisher of record; (3) decisions on the three flagged journals and on the Bio Technology/bioinformatics boundary. This does not claim any source worldwide is exhausted.

## 1. Baseline

Verified again from production at 08:44 UTC: all 95 added journals present (Bio Technology 14, Electrical 33, Electronics & Telecom 48; 0 field problems, 0 identifier collisions, 0 articles attached); totals Accepted 12,840, MetadataOnly 16,455, NeedsReview 25,607. Department counts unchanged from round 6: Bio Technology 778 total / 443 public, Electrical 572 / 357, Electronics & Telecom 510 / 218. No journal import was active; other sessions' commits and uncommitted work were not touched.

| | Count |
|---|---|
| **Additions this round** | **0** |
| Retained added records (rounds 2-5, all present, unchanged) | 95 |
| Flagged retained records (separate decision; unchanged) | 3 |

## 2. Wiley export

`https://onlinelibrary.wiley.com/library-info/resources/discovery/kbart2019` returns HTTP 403 (Cloudflare challenge) to the crawler and to the fetch tool. **User action:** open that page in a normal browser, pass the check, select the KBART file for **all journals** (the complete journals list, not a book, collection or consortium file), download the tab-separated text and save it as `data/dept-coverage4/raw/wiley-kbart-journals.txt`. The pipeline already parses it; KBART will be used as identity/discovery only, with subject scope and current publication verified independently. Independent work continued.

## 3. The 105 shortlisted candidates, reviewed individually (`shortlist-review-outcomes.csv/.json`, `review-summary.json`)

Reviewer for every row: **an automated reader (robots-respecting crawler)**. `manuallyVerified` is `false` for all 105; no person examined any of this evidence, and none is claimed. Each row records the official URL and how it was obtained, the evidence URLs actually read, the verification date, the direct-versus-aggregator provenance, the outcome and the exact next step.

* **Official URLs:** 66 had one; 39 had none. Searching only by ISSN equality (DOAJ API, Wikidata, OpenAlex; never by title) found **14** (all from Wikidata, community-curated; DOAJ and OpenAlex gave none). **25 stay unresolved**: a person must find the official site by ISSN.
* **Direct versus aggregator evidence:** the subject signal for 104 of the candidates is OpenAlex's topic analysis of their articles, an aggregator inference, not the journal's own statement; publication evidence is the publisher's own Crossref deposits (direct). Homepage copies from OpenAlex or Wikidata are never counted as confirmation. Only text read on the journal's own pages counts as direct scope evidence.
* **Outcomes (105):** A) scope supported by the official pages but held at the gates: **1**; B) official pages read, scope not confirmed: **47**; C) ambiguous Electrical vs Electronics: **3**; D) official site did not answer: **25**; E) robots.txt disallows automated reading: **4**; F) official URL unresolved: **25**.
* **The one that reached a second kind:** *Mikrotalasna revija* / *Microwave Review* (ISSN 1450-5835; e-ISSN 2406-1050; Electronics & Telecom). Its own site (found through the ISSN-matched Wikidata item) states a clearly microwave scope (6 department phrases, clear lead), the OpenAlex topic lexicon is 88% electronics/telecom, and Crossref shows 55 works in 2024-26 across three years. It is **held at the gates** because the **publisher of record conflicts**: Crossref names the depositor (*Faculty of Philology, University of Belgrade*) while the journal's own site names the *Society for Microwave Technique, Technologies and Systems* with the *Serbia & Montenegro IEEE MTT-S Chapter*. Writing either string automatically would risk a wrong public publisher; a person must confirm the publisher of record at the official URL, after which every other gate already passes.
* **Why most stay on hold:** pages read but the department was not stated (47) and inaccessible or unresolved evidence (54). No outcome was upgraded without direct evidence, and the roughly 100 others were not assumed to qualify.

## 4. The three flagged existing journals (`flagged-journals-recommendations.md`)

Exact journal ids, production audit-row ids, original rationale, remaining admissible evidence and a rule-version comparison are in that file. **On the apparent contradiction:** "meets every criterion" is a statement against the criteria in force on the insertion date (a count of different agreeing kinds, with no strength gradient); "second evidence is weak" is a strength judgement those criteria did not encode, which later rounds added (a lead requirement over the next department, recognition that a publisher's sector list is a weak kind). The discrepancy is **rule-version drift, not a mis-evaluation**. Recommendations (not executed): *Journal of Signal Processing Systems* **retain and mark for a scope check**; *e+i Elektrotechnik und Informationstechnik* **retain and mark for a scope check**; *Biomass Conversion and Biorefinery* **retain pending a boundary decision** (it resembles the held *Waste and Biomass Valorization*); the fourth affected journal, *Cellular and Molecular Bioengineering*, **retain**. Bounded options for the decision-maker are listed with the exact-id, dependency-guarded statement (dependencies today: none). No journal was deleted, reclassified or edited and no production audit row was changed.

## 5. Bioinformatics and one taxonomy

The 54 bioinformatics titles stay held. `taxonomy-proposal-books-journals.md` proposes one shared definition table for Books and Journals with core, peripheral and excluded terms, and uses read-only production counts: of books with *bioinformatic* in the title, 91 are in Life Sciences and only 5 in Bio Technology (of 970 Bio Technology books); journals: 12 Life Sciences, 9 Bio Technology, 4 Computer / IT. The proposal: bioinformatics defaults to Life Sciences (matching existing practice), Bio Technology only with an explicit biotechnology scope statement, no retroactive reclassification. Nothing was applied; Bio Technology was not broadened.

## 6. Evidence integrity (`evidence-integrity-scope.md`)

The incident/redaction log and checksums are retained. **Discarded page text (small excerpts for four journals; never full pages) still exists in:** Git history, commits `d47e8fe` and `8cf7576`, both reachable from `origin/feat/email-due-users-overlap` (pushed by another session through `7d84c90`; the redaction commit `9e81c56` is local only); three production `IngestionAudit` rows (ids in the file); and the assistant's own session-log stores outside the repository. It was **removed** from the working tree (eight files), from the local work files (14 more entries scrubbed this round) and from the purged scope files. History was not rewritten and no production audit row was edited; options for the repository owner are listed. No discarded text is reproduced in this or any new report.

## Tests

`test_crawler_redirects.py` 12/12, `test-journal-apply-transactional` 22/22, `test-title-topic-department` 22/22, `test-official-list-department` 26/26, `test-dept-coverage2-manifest` 16/16 on rounds 2-5, `test-journal-source-import` 39/39, `test-nlm-journals` 15/15, `test-openalex-journals` 60/60, `test-journal-quality` 52/52. The two new scripts (`resolve_urls.py`, `review_shortlist.py`) are evidence-review tooling, not production writers; their outputs are individually recorded and inspectable.
