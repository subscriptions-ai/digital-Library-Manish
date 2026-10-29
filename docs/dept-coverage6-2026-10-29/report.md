# Bio Technology, Electrical Engineering, Electronics & Telecommunication: validation round 6 (zero additions)

## Senior-management update

**No journals were added this round, and that is the correct outcome.** No candidate met every established rule on admissible evidence, and nothing was written to production. The cumulative position was re-verified: **95 journals added across the three departments, all present in production with no problems; 1,905 of the 2,000 ceiling remain unused.**

**Three things need a person or a decision, not more automation:**
1. **Manual export.** Wiley's complete journal list sits behind a browser check. One download by a person (steps and exact filename in `manual-exports.md`) lets the pipeline use it as an identity/discovery list; it will not by itself prove subject, current publication or rights. IET's portfolio page has no list and points to Wiley.
2. **Scope evidence.** About 1,440 candidates have one kind of department evidence. 413 have a readable website with no department text, 339 sites do not answer, 250 disallow automated reading (Springer's own scope pages among them) and 199 have no homepage. A ranked shortlist of 105 candidates with confirmed identity, current publication and one strong subject signal is ready for a person to confirm in each journal's own aims and scope (`manual-review-shortlist.md/.csv`).
3. **Taxonomy and a closeout decision.** 54 bioinformatics titles stay held until the definitions agree (the books classifier names bioinformatics under Bio Technology; the journal rules do not). Four earlier-added journals lost evidence taken from a page the crawler should not have read; all four still meet the criteria on the evidence that remains, but three are borderline and are flagged for a separate decision. Nothing was removed.

This does not claim any source worldwide is exhausted; it reports what can be done with permitted automated access.

## 1. Cumulative verification and baseline

The 95 journals of rounds 2-5 are all present (95 of 95 rows; Electronics 48, Electrical 33, Bio Technology 14; 0 field problems, 0 identifier collisions, 0 same-title rows, 0 articles). Production at 08:13 UTC: 54,902 journals (Accepted 12,840, MetadataOnly 16,455, NeedsReview 25,607); no journal import was active; other sessions' uncommitted work (books, admin UI) was left alone.

| Department | All-record total | Public (Accepted + MetadataOnly) | Public with a published article | NeedsReview | Added by this work |
|---|---|---|---|---|---|
| Bio Technology | 778 | 443 | 272 | 335 | 14 |
| Electrical Engineering | 572 | 357 | 153 | 215 | 33 |
| Electronics & Telecommunication | 510 | 218 | 51 | 292 | 48 |

## 2. Reporting reconciled (`reconciliation.json`)

**The single-evidence pool, one partition, 1,442 candidates:** readable site with no department phrase 413 + site unreachable 339 + robots.txt disallows (including a redirect destination) 250 + no homepage found 199 + readable with 1-2 phrases (ambiguous) 181 + readable with phrases but not strong enough (a neighbouring department is also named, or no clear lead) 38 + readable with another department leading (contradicted) 22 = **1,442** (Bio Technology 331, Electrical 700, Electronics & Telecom 411). The earlier text listed only the first four (1,201) beside the readable ones.

**The Springer pages, two views of the same 230 candidates** (not additive): by how the page was reached, 201 were re-pointed from an unreadable listed homepage to the official Springer/Nature journal page, 22 already had such a listing, 7 entered the candidate set after the vocabulary update; by what the page said, 157 lacked department text, 63 were ambiguous (1-2 phrases), 8 had 3+ phrases with a clear lead, 2 were contradicted. Both sum to 230. The page text was discarded in the incident, so a cross-tabulation cannot be recomputed.

**Totals kept apart:** all-record and public totals are catalogue counts (table above). Candidate pool (unchanged by this round): 50,389 net-new = 47,695 out of scope + 2,678 held + 16 eligible (2 inserted + 14 manual holds). Holds: **confirmed exclusions** (rejected) 918 = 267 non-journal serials / ceased / invalid ISSN + 651 department not supported by a rule or non-Latin title; **unresolved** 1,760 = 35 identity + 283 publication evidence + 1,442 one kind of evidence; **manual holds** 14. 918 + 1,760 + 14 = 2,692 held records.

## 3. Crawler incident closed before any further crawling (`crawler-incident-closeout.md`)

* **Every hop is checked.** Redirects are now followed by hand: robots.txt is consulted before the first request and before each redirect target (any host or path), at most 5 hops, non-http targets refused, a disallowed URL is never requested. **12 tests** with three local servers cover allowed → allowed, allowed → disallowed path/host, an all-allowed chain, allowed → allowed → disallowed chains (including across two hosts), same-host redirects into a disallowed path, a loop and a six-hop chain, and non-http targets.
* **Evidence re-audited and purged** (rounds 2-5 and the recovery file; page text of the discarded entries deleted locally).
* **The four affected inserted journals**, revalidated on admissible evidence with independence noted: *Cellular and Molecular Bioengineering* **still meets all criteria** (title + NLM Catalog record + Crossref deposits); *Biomass Conversion and Biorefinery*, *Journal of Signal Processing Systems* and *e+i Elektrotechnik und Informationstechnik* **still meet the criteria as applied when they were added, but the retained second kind is moderate or weak** (topics 32% biotechnology lexicon while the similar *Waste and Biomass Valorization* was held; Computer / IT leads the topics 63% vs 32%; a publisher grouping with no topic support). All three are **flagged for a separate bounded remediation decision** with the exact-id, dependency-guarded statement (dependencies today: none). No journal was removed or modified.
* **Audit trail:** the page-derived text for those four journals was redacted from eight committed manifests and plans, with before/after checksums in `redaction-log.json` and the post-redaction manifest checksum recorded beside the original. Not changed: git history (earlier versions remain) and the production `IngestionAudit` rows (historical records; correcting them needs explicit authorisation).

## 4. Permitted evidence

* **Wiley KBART:** no file supplied, the page still answers with the Cloudflare challenge, the request was not repeated; exact browser steps and filename (`data/dept-coverage4/raw/wiley-kbart-journals.txt`) are in `manual-exports.md`. KBART will be treated as identity/discovery only.
* **Ranked manual-review shortlist:** 105 candidates (Electrical 80, Electronics & Telecom 25, Bio Technology 0), each with valid ISSNs, a publisher, current Crossref deposits (≥ 3 works in 2024-26, in ≥ 2 years, ≥ 1 in 2025-26) and one strong subject signal; for each the official URL (or the instruction to find it by ISSN where none is known; 39 have no URL) and the exact missing evidence: a statement in the journal's own aims and scope confirming the department. 6 are robots-disallowed hosts (the person reads the page, the crawler does not). Two show both Electrical and Electronics phrases and need a person to choose under the existing taxonomy. Only APIs (Crossref, OpenAlex, PubMed) were used for the shortlist; no page was crawled.

## 5. Biotechnology

The 54 bioinformatics/biostatistics titles stay held (`bioinformatics-taxonomy-sample.md`): a ten-journal sample against the existing definitions shows the books classifier names bioinformatics under Bio Technology while the journal rules name only biotechnology; Computer / IT does not claim it; the journals' topics are mostly Life Sciences (40 of 54). No broadening and no reclassification of existing journals; options and the decision needed are in that file.

## 6. Why nothing was inserted

The only inputs this round that could have changed eligibility were new permitted evidence (a Wiley file, readable scope pages), and none arrived; the redirect closeout removed evidence rather than adding it. Re-running the pipeline on the retained evidence reproduces the round-5 outcome (16 eligible = 2 already inserted + 14 manual holds). No production write was made; the remaining allowance is unchanged at 1,905.

## Tests and artefacts

`test_crawler_redirects.py` 12/12 (new), `test-journal-apply-transactional` 22/22, `test-title-topic-department` 22/22, `test-official-list-department` 26/26, `test-dept-coverage2-manifest` 16/16 on the manifests of rounds 2-5 (accepts the recorded post-redaction checksum), `test-journal-source-import` 39/39, `test-nlm-journals` 15/15, `test-openalex-journals` 60/60, `test-journal-quality` 52/52. Run id `dept-coverage6-2026-10-29-25715162` (zero additions; no audit row). Raw downloads, snapshots and work files stay in git-ignored `data/`.
